package db

import (
	"fmt"
	"strings"
	"testing"
	"time"
)

func TestTaskAndTemplateRemarkLimitIsShared(t *testing.T) {
	boundary := strings.Repeat("界", MaxTaskRemarkRunes)
	if _, _, err := normalizeTaskTemplateInput(TaskTemplateInput{Name: "n", Description: "d", Goal: "g", Remark: boundary}); err != nil {
		t.Fatalf("boundary remark rejected: %v", err)
	}
	if _, _, err := normalizeTaskTemplateInput(TaskTemplateInput{Name: "n", Description: "d", Goal: "g", Remark: boundary + "界"}); err == nil {
		t.Fatal("oversized template remark accepted")
	}
}

func TestWorkerCountNormalizationAndLimit(t *testing.T) {
	if got := normalizeWorkerCount(-1); got != 0 {
		t.Fatalf("negative worker count = %d, want 0", got)
	}
	if _, _, err := normalizeTaskTemplateInput(TaskTemplateInput{Name: "n", Description: "d", Goal: "g", WorkerCount: MaxTaskWorkerCount}); err != nil {
		t.Fatalf("maximum worker count rejected: %v", err)
	}
	if _, _, err := normalizeTaskTemplateInput(TaskTemplateInput{Name: "n", Description: "d", Goal: "g", WorkerCount: MaxTaskWorkerCount + 1}); err == nil {
		t.Fatal("oversized worker count accepted")
	}
}

func TestTaskOptionsPersistAndValidateLimits(t *testing.T) {
	d, err := Open(testDSN(t))
	if err != nil {
		t.Skipf("postgres unavailable (%v) — skipping", err)
	}
	defer d.Close()

	if _, err := d.CreateTaskWithOptions("oversized remark", "goal", TaskCreateOptions{
		Remark: strings.Repeat("界", MaxTaskRemarkRunes+1),
	}); err == nil {
		t.Fatal("2001-rune task remark accepted")
	}
	if _, err := d.CreateTaskWithOptions("oversized workers", "goal", TaskCreateOptions{
		WorkerCount: MaxTaskWorkerCount + 1,
	}); err == nil {
		t.Fatal("51-worker task accepted")
	}

	remark := strings.Repeat("界", MaxTaskRemarkRunes)
	task, err := d.CreateTaskWithOptions("task options boundary", "goal", TaskCreateOptions{
		Remark: remark, WorkerCount: MaxTaskWorkerCount,
	})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = d.DeleteTask(task.ID) })
	gotTask, err := d.GetTask(task.ID)
	if err != nil {
		t.Fatal(err)
	}
	if gotTask == nil || gotTask.Remark != remark || gotTask.WorkerCount != MaxTaskWorkerCount {
		t.Fatalf("task options round trip = %+v", gotTask)
	}

	name := fmt.Sprintf("options template %d", time.Now().UnixNano())
	templateRemark := "模板备注 📝"
	template, err := d.CreateTaskTemplate(TaskTemplateInput{
		Name: name, Description: "template description", Goal: "template goal",
		Remark: templateRemark, WorkerCount: MaxTaskWorkerCount,
	})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _, _ = d.DeleteTaskTemplate(template.ID) })
	gotTemplate, err := d.GetTaskTemplate(template.ID)
	if err != nil {
		t.Fatal(err)
	}
	if gotTemplate == nil || gotTemplate.Remark != templateRemark || gotTemplate.WorkerCount != MaxTaskWorkerCount {
		t.Fatalf("created template options round trip = %+v", gotTemplate)
	}

	updatedRemark := strings.Repeat("改", MaxTaskRemarkRunes)
	updatedWorkers := MaxTaskWorkerCount - 1
	updated, err := d.PatchTaskTemplate(template.ID, TaskTemplatePatch{
		Remark: &updatedRemark, WorkerCount: &updatedWorkers,
	})
	if err != nil {
		t.Fatal(err)
	}
	if updated.Remark != updatedRemark || updated.WorkerCount != updatedWorkers {
		t.Fatalf("updated template options = %+v", updated)
	}
	gotTemplate, err = d.GetTaskTemplate(template.ID)
	if err != nil {
		t.Fatal(err)
	}
	if gotTemplate == nil || gotTemplate.Remark != updatedRemark || gotTemplate.WorkerCount != updatedWorkers {
		t.Fatalf("updated template options round trip = %+v", gotTemplate)
	}
}
