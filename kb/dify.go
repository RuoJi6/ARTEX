package kb

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// Dify 后端对接 Dify 知识库的检索 API。只触发检索、不做生成；API Key 用 dataset 级
// key（dataset-xxx），不与 app key 混用。鉴权失败(401/403)单独归类、提示 API Key 可能
// 已轮换——区别于网络不可达。
//
// 支持两代检索 API，通过 api_version 配置选择（默认 datasets）：
//   - datasets  老版 Dataset API：POST /v1/datasets/{dataset_id}/retrieve
//   - knowledge 新版 Knowledge API：POST /v1/knowledge/retrieve（dataset_id 走 dataset_ids 数组）
//
// 两代返回结构一致（records[].segment.content / segment.document.name / score），故解析共用。

const (
	defaultTopK      = 5
	defaultTimeout   = 5 * time.Second
	defaultMinScore  = 0.0
	difyAPIDatasets  = "datasets"  // 老版 Dataset API
	difyAPIKnowledge = "knowledge" // 新版 Knowledge API
)

type difyBackend struct {
	baseURL    string
	apiKey     string
	datasetID  string
	apiVersion string
	minScore   float64
	client     *http.Client
}

func init() { Register("dify", newDify) }

func newDify(cfg map[string]any) (Searcher, error) {
	baseURL := cfgStr(cfg, "base_url")
	apiKey := cfgStr(cfg, "api_key")
	datasetID := cfgStr(cfg, "dataset_id")
	if baseURL == "" || apiKey == "" || datasetID == "" {
		return nil, fmt.Errorf("dify 后端缺少 base_url / api_key / dataset_id")
	}
	apiVersion := cfgStr(cfg, "api_version")
	if apiVersion == "" {
		apiVersion = difyAPIDatasets
	}
	if apiVersion != difyAPIDatasets && apiVersion != difyAPIKnowledge {
		return nil, fmt.Errorf("dify 后端不支持的 api_version: %q（可选 datasets / knowledge）", apiVersion)
	}
	timeout := cfgDuration(cfg, "timeout", defaultTimeout)
	return &difyBackend{
		baseURL:    strings.TrimRight(baseURL, "/"),
		apiKey:     apiKey,
		datasetID:  datasetID,
		apiVersion: apiVersion,
		minScore:   cfgFloat(cfg, "min_score", defaultMinScore),
		client:     kbHTTPClient(timeout),
	}, nil
}

// difyRetrieveReq 是老版 Dataset API 的请求体。
type difyRetrieveReq struct {
	Query          string        `json:"query"`
	RetrievalModel difyRetrieval `json:"retrieval_model"`
}

// difyKnowledgeReq 是新版 Knowledge API 的请求体（dataset_id 放在 dataset_ids 数组里）。
type difyKnowledgeReq struct {
	DatasetIDs     []string      `json:"dataset_ids"`
	Query          string        `json:"query"`
	RetrievalModel difyRetrieval `json:"retrieval_model"`
}

type difyRetrieval struct {
	SearchMethod    string `json:"search_method"` // hybrid / semantic / full_text / keyword
	RerankingEnable bool   `json:"reranking_enable"`
	TopK            int    `json:"top_k"`
}

type difyRetrieveResp struct {
	Records []difyRecord `json:"records"`
}

type difyRecord struct {
	Segment struct {
		Content  string `json:"content"`
		Document struct {
			Name string `json:"name"`
		} `json:"document"`
	} `json:"segment"`
	Score float64 `json:"score"`
}

func (d *difyBackend) Search(ctx context.Context, query string, topK int) ([]Hit, error) {
	if topK <= 0 {
		topK = defaultTopK
	}
	retrieval := difyRetrieval{
		SearchMethod:    "hybrid",
		RerankingEnable: false,
		TopK:            topK,
	}
	var (
		url     string
		reqBody any
	)
	if d.apiVersion == difyAPIKnowledge {
		url = fmt.Sprintf("%s/v1/knowledge/retrieve", d.baseURL)
		reqBody = difyKnowledgeReq{DatasetIDs: []string{d.datasetID}, Query: query, RetrievalModel: retrieval}
	} else {
		url = fmt.Sprintf("%s/v1/datasets/%s/retrieve", d.baseURL, d.datasetID)
		reqBody = difyRetrieveReq{Query: query, RetrievalModel: retrieval}
	}
	b, _ := json.Marshal(reqBody)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(b))
	if err != nil {
		return nil, fmt.Errorf("构造检索请求: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+d.apiKey)

	resp, err := d.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("知识库不可达: %w", err)
	}
	defer resp.Body.Close()

	switch {
	case resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden:
		return nil, fmt.Errorf("知识库鉴权失败(HTTP %d)，API Key 可能已轮换", resp.StatusCode)
	case resp.StatusCode != http.StatusOK:
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return nil, fmt.Errorf("知识库返回 %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}

	var out difyRetrieveResp
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return nil, fmt.Errorf("解析检索结果: %w", err)
	}
	hits := make([]Hit, 0, len(out.Records))
	for _, r := range out.Records {
		if d.minScore > 0 && r.Score < d.minScore {
			continue
		}
		hits = append(hits, Hit{
			Title:   r.Segment.Document.Name,
			Score:   r.Score,
			Content: r.Segment.Content,
		})
	}
	return hits, nil
}
