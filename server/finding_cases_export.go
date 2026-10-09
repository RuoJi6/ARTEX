package server

import (
	"fmt"
	"strings"

	"github.com/Autumn-27/artex/db"
)

type findingCaseExportPlan struct {
	cases      map[int64]*db.FindingCase
	membership map[int64]int64
	selected   map[int64]bool
}

// Expand selection to complete cases before the evidence store freezes snapshots.
func (s *Server) prepareFindingCaseExport(fs []*db.DBFinding) ([]*db.DBFinding, *findingCaseExportPlan, error) {
	plan := &findingCaseExportPlan{cases: map[int64]*db.FindingCase{}, membership: map[int64]int64{}, selected: map[int64]bool{}}
	expanded := append([]*db.DBFinding{}, fs...)
	seen := map[int64]bool{}
	for _, f := range fs {
		seen[f.ID] = true
		plan.selected[f.ID] = true
	}
	for _, f := range fs {
		cid, err := s.m.pg.FindingCaseID(f.ID)
		if err != nil {
			return nil, nil, err
		}
		if cid == 0 {
			continue
		}
		if _, ok := plan.cases[cid]; ok {
			continue
		}
		c, err := s.m.pg.GetFindingCase(cid)
		if err != nil {
			return nil, nil, err
		}
		if c == nil || !c.Active {
			continue
		}
		plan.cases[cid] = c
		members, _, err := s.m.pg.FindingCaseMembers(cid, 1, 1000000)
		if err != nil {
			return nil, nil, err
		}
		for _, m := range members {
			plan.membership[m.ID] = cid
			if !seen[m.ID] {
				seen[m.ID] = true
				expanded = append(expanded, m)
			}
		}
	}
	return expanded, plan, nil
}

// Composites are built AFTER staging real records, so their traffic attachments
// remain private frozen export copies, not aliases to live or deleted evidence.
func (s *Server) consolidateFindingCaseExport(fs []*db.DBFinding, plan *findingCaseExportPlan, includeOriginals bool) ([]*db.DBFinding, error) {
	out := []*db.DBFinding{}
	emitted := map[int64]bool{}
	for _, f := range fs {
		cid := plan.membership[f.ID]
		if cid == 0 {
			if plan.selected[f.ID] {
				out = append(out, f)
			}
			continue
		}
		if !emitted[cid] {
			emitted[cid] = true
			c := plan.cases[cid]
			latest, err := s.m.pg.GetFindingCase(cid)
			if err != nil {
				return nil, err
			}
			stale := latest == nil || latest.Version != c.Version || c.ReportVersion != c.Version
			title := c.Title
			sev := c.Severity
			if sev == "" {
				sev = "unassessed"
			}
			composite := &db.DBFinding{ID: f.ID, ExportCaseID: c.ID, TaskID: c.TaskID, TaskDescription: f.TaskDescription, Name: title, VulnClass: "归并漏洞", Severity: sev, Status: f.Status, CreatedAt: c.CreatedAt, Report: c.Report, EvidenceVersion: c.Version, ReportEvidenceVersion: c.ReportVersion}
			assets := map[int64]bool{}
			var refs []string
			var evidence strings.Builder
			for _, member := range fs {
				if plan.membership[member.ID] != cid {
					continue
				}
				composite.ExportMemberIDs = append(composite.ExportMemberIDs, member.ID)
				for _, aid := range member.AssetIDs {
					if !assets[aid] {
						assets[aid] = true
						composite.AssetIDs = append(composite.AssetIDs, aid)
					}
				}
				refs = append(refs, fmt.Sprintf("#%d [%s] %s", member.ID, member.Severity, member.Name))
				fmt.Fprintf(&evidence, "原始上报 #%d：%s\n%s\n\n", member.ID, member.Summary, member.Evidence)
				if member.Report != "" {
					fmt.Fprintf(&evidence, "原始报告 #%d：\n%s\n\n", member.ID, member.Report)
				}
				for _, b := range member.TrafficBindings {
					b.Note = fmt.Sprintf("来自上报 #%d；%s", member.ID, b.Note)
					composite.TrafficBindings = append(composite.TrafficBindings, b)
				}
			}
			composite.Summary = fmt.Sprintf("漏洞文件夹 #%d；原始记录：%s。统一评级依据：%s", cid, strings.Join(refs, "；"), c.SeverityReason)
			composite.TrafficCount = len(composite.TrafficBindings)
			if stale || c.Report == "" {
				composite.Report = "**统一报告尚未生成或已过期，以下提供全部原始证据，不能视为完整复现已验证。**\n\n" + c.Report
				composite.Evidence = evidence.String()
				composite.ReportEvidenceVersion = -1
			}
			out = append(out, composite)
		}
		if includeOriginals {
			out = append(out, f)
		}
	}
	return out, nil
}
