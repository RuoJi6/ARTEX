package agent

import (
	"context"
	"errors"
	"iter"
	"strings"
	"testing"

	"github.com/Autumn-27/norma/llm"
)

type autoTitleProvider struct {
	reply string
	err   error
	req   llm.CompletionRequest
}

func (p *autoTitleProvider) Complete(_ context.Context, req llm.CompletionRequest) (llm.Message, string, llm.Usage, error) {
	p.req = req
	if p.err != nil {
		return llm.Message{}, "", llm.Usage{}, p.err
	}
	return llm.Message{Role: llm.RoleAssistant, Content: []llm.ContentBlock{llm.TextBlock(p.reply)}}, "stop", llm.Usage{}, nil
}

func (p *autoTitleProvider) Stream(context.Context, llm.CompletionRequest) iter.Seq2[llm.StreamEvent, error] {
	return func(func(llm.StreamEvent, error) bool) {}
}

func TestGenerateAutoTitleCleansResponse(t *testing.T) {
	long := strings.Repeat("很长", 30)
	p := &autoTitleProvider{reply: "\n\"标题：" + long + "\"\n第二行"}
	got, err := GenerateAutoTitle(t.Context(), p, "用户希望整理项目设置")
	if err != nil {
		t.Fatal(err)
	}
	if strings.ContainsAny(got, "\r\n") || strings.Contains(got, "标题：") || strings.HasPrefix(got, "\"") || len([]rune(got)) > 40 {
		t.Fatalf("unclean title %q", got)
	}
	if p.req.Thinking != "disabled" || p.req.MaxTokens != 96 || len(p.req.Tools) != 0 {
		t.Fatalf("request options: %+v", p.req)
	}

	quoted := &autoTitleProvider{reply: `标题："整理项目设置"`}
	got, err = GenerateAutoTitle(t.Context(), quoted, "整理项目设置")
	if err != nil {
		t.Fatal(err)
	}
	if got != "整理项目设置" {
		t.Fatalf("nested quote/prefix cleanup: got %q", got)
	}
}

func TestGenerateAutoTitleProviderError(t *testing.T) {
	_, err := GenerateAutoTitle(t.Context(), &autoTitleProvider{err: errors.New("boom")}, "内容")
	if err == nil {
		t.Fatal("expected provider error")
	}
}
