// Package kb 接入外部知识库（Dify 等）的语义检索，为 agent 提供 knowledge_search
// 工具：遇到具体技术点先检索外部知识，再结合实际执行验证。这里只做"检索"，不做
// 生成——检索结果是参考线索，必须经真实命令/响应确认后才能写回图谱。
//
// 多后端通过 Factory/Register 可插拔：新增一个后端 = 实现 Searcher + init 里 Register，
// 工具、Registry、装配链都不动。
package kb

import (
	"context"
	"errors"
)

// ErrNoHit 表示知识源检索成功但没有任何命中——与"检索失败"（后端不可达/鉴权失败）
// 是两种语义，工具据此区分"无匹配知识"和"知识库暂不可用"。
var ErrNoHit = errors.New("kb: 无匹配知识")

// Hit 是一条检索命中片段。Source 是【知识源名】（如 "cve"/"internal"），由 Registry
// 统一标注，与后端类型无关；agent 依据 source + score 判断可信度。
type Hit struct {
	Source  string  `json:"source"`
	Title   string  `json:"title"`
	Score   float64 `json:"score"`
	Content string  `json:"content"`
}

// Searcher 是一个知识源后端的最小接口。一个后端（Dify/Milvus/pgvector）= 一个实现。
type Searcher interface {
	Search(ctx context.Context, query string, topK int) ([]Hit, error)
}
