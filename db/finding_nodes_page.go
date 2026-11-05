package db

import (
	"encoding/json"
	"fmt"
	"strings"
)

type FindingNodePageItem struct {
	Node          *Node
	ExplorationID int64
}

// FindingNodesPage pages current and direct-source finding nodes together,
// including nodes without standalone findings rows.
func (s *ExplorationStore) FindingNodesPage(explorationIDs []int64, severity, query, sort, direction string, page, size int) ([]FindingNodePageItem, int, error) {
	if page < 1 {
		page = 1
	}
	if size < 1 || size > 200 {
		size = 20
	}
	conds := []string{"exploration_id = ANY($1::bigint[])", "kind='finding'"}
	args := []any{explorationIDs}
	if severity != "" {
		args = append(args, severity)
		conds = append(conds, fmt.Sprintf("payload->>'severity' = $%d", len(args)))
	}
	if query = strings.TrimSpace(query); query != "" {
		escaped := strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`).Replace(query)
		args = append(args, "%"+escaped+"%")
		p := fmt.Sprintf("$%d", len(args))
		conds = append(conds, fmt.Sprintf(`(COALESCE(payload->>'name','') ILIKE %s ESCAPE '\' OR
			COALESCE(payload->>'vulnclass','') ILIKE %s ESCAPE '\' OR
			COALESCE(payload->>'summary','') ILIKE %s ESCAPE '\' OR
			COALESCE((payload->'evidence')::text,'') ILIKE %s ESCAPE '\')`, p, p, p, p))
	}
	where := " WHERE " + strings.Join(conds, " AND ")
	var total int
	if err := s.db.QueryRow(`SELECT COUNT(*) FROM exploration_nodes`+where, args...).Scan(&total); err != nil {
		return nil, 0, err
	}
	if total == 0 || page > (total-1)/size+1 {
		return []FindingNodePageItem{}, total, nil
	}
	timeOrder := "DESC"
	if direction == "asc" {
		timeOrder = "ASC"
	}
	order := "created_at " + timeOrder + ", id DESC"
	if sort == "severity" {
		order = `CASE payload->>'severity' WHEN 'critical' THEN 4 WHEN 'high' THEN 3 WHEN 'medium' THEN 2 WHEN 'low' THEN 1 ELSE 0 END DESC, ` + order
	}
	args = append(args, size, (page-1)*size)
	rows, err := s.db.Query(`SELECT `+nodeCols+`, exploration_id FROM exploration_nodes`+where+
		` ORDER BY `+order+fmt.Sprintf(" LIMIT $%d OFFSET $%d", len(args)-1, len(args)), args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	items := []FindingNodePageItem{}
	for rows.Next() {
		var item FindingNodePageItem
		var payload []byte
		node := &Node{}
		if err := rows.Scan(&node.ID, &node.Kind, &payload, &node.Priority, &node.State, &node.Origin,
			&node.Owner, &node.BlockedReason, &node.DeleteReason, &node.CreatedAt, &item.ExplorationID); err != nil {
			return nil, 0, err
		}
		node.Payload = json.RawMessage(payload)
		item.Node = node
		items = append(items, item)
	}
	return items, total, rows.Err()
}

// FindingMetaForNodes loads metadata only for the nodes on a finding page.
func (d *DB) FindingMetaForNodes(nodeIDs []int64) (map[int64]FindingMeta, error) {
	out := make(map[int64]FindingMeta, len(nodeIDs))
	if len(nodeIDs) == 0 {
		return out, nil
	}
	rows, err := d.Query(`SELECT f.node_id, f.id, COALESCE(f.status,'pending'), f.asset_ids,
		(SELECT count(*) FROM finding_traffic_bindings b WHERE b.finding_id=f.id)
		FROM findings f JOIN exploration_nodes n ON n.id=f.node_id
		JOIN tasks t ON t.id=f.task_id AND t.exploration_id=n.exploration_id
		WHERE f.node_id = ANY($1::bigint[]) ORDER BY f.id`, nodeIDs)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var nodeID int64
		var item FindingMeta
		var assets string
		if err := rows.Scan(&nodeID, &item.ID, &item.Status, &assets, &item.TrafficCount); err != nil {
			return nil, err
		}
		_ = json.Unmarshal([]byte(assets), &item.AssetIDs)
		out[nodeID] = item
	}
	return out, rows.Err()
}
