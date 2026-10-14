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

// Dify 后端对接 Dify 知识库的检索 API（/v1/datasets/{dataset_id}/retrieve）。只触发
// 检索、不做生成；API Key 用 dataset 级 key（dataset-xxx），不与 app key 混用。
// 鉴权失败(401/403)单独归类、提示 API Key 可能已轮换——区别于网络不可达。

const (
	defaultTopK     = 5
	defaultTimeout  = 5 * time.Second
	defaultMinScore = 0.0
)

type difyBackend struct {
	baseURL   string
	apiKey    string
	datasetID string
	minScore  float64
	client    *http.Client
}

func init() { Register("dify", newDify) }

func newDify(cfg map[string]any) (Searcher, error) {
	baseURL := cfgStr(cfg, "base_url")
	apiKey := cfgStr(cfg, "api_key")
	datasetID := cfgStr(cfg, "dataset_id")
	if baseURL == "" || apiKey == "" || datasetID == "" {
		return nil, fmt.Errorf("dify 后端缺少 base_url / api_key / dataset_id")
	}
	timeout := cfgDuration(cfg, "timeout", defaultTimeout)
	return &difyBackend{
		baseURL:   strings.TrimRight(baseURL, "/"),
		apiKey:    apiKey,
		datasetID: datasetID,
		minScore:  cfgFloat(cfg, "min_score", defaultMinScore),
		client:    kbHTTPClient(timeout),
	}, nil
}

type difyRetrieveReq struct {
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
	reqBody := difyRetrieveReq{
		Query: query,
		RetrievalModel: difyRetrieval{
			SearchMethod:    "hybrid",
			RerankingEnable: false,
			TopK:            topK,
		},
	}
	b, _ := json.Marshal(reqBody)
	url := fmt.Sprintf("%s/v1/datasets/%s/retrieve", d.baseURL, d.datasetID)
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
