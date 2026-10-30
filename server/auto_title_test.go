package server

import "testing"

func TestAutoTitleMayReplace(t *testing.T) {
	for _, current := range []string{"", "新对话", "首条消息预览"} {
		if !autoTitleMayReplace(current, "首条消息预览") {
			t.Fatalf("expected %q to be replaceable", current)
		}
	}
	if autoTitleMayReplace("用户手动改的标题", "首条消息预览") {
		t.Fatal("manual title must not be overwritten")
	}
}

func TestAutoTitleIsUsable(t *testing.T) {
	for _, generated := range []string{"", "新对话"} {
		if autoTitleIsUsable(generated) {
			t.Fatalf("placeholder title %q must be rejected", generated)
		}
	}
	if !autoTitleIsUsable("整理项目设置") {
		t.Fatal("generated title should be accepted")
	}
}
