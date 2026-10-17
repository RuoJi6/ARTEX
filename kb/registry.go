package kb

import (
	"context"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"sync"
	"time"
)

// Factory 按一个类型名构造后端。cfg 是配置里该源的完整字段（含 name/type，后端取自己
// 需要的字段即可）。注册发生在各后端的 init，所以"新增一个后端 = 加一行 Register"。
type Factory func(cfg map[string]any) (Searcher, error)

var (
	factoriesMu sync.RWMutex
	factories   = map[string]Factory{}
)

// Register 供后端在 init 里注册自己。typ 即配置里该源的 "type" 字段值。
func Register(typ string, f Factory) {
	factoriesMu.Lock()
	defer factoriesMu.Unlock()
	factories[typ] = f
}

// Build 按类型名构造一个后端。未知类型返回错误。
func Build(typ string, cfg map[string]any) (Searcher, error) {
	factoriesMu.RLock()
	f, ok := factories[typ]
	factoriesMu.RUnlock()
	if !ok {
		return nil, fmt.Errorf("kb: 未知后端类型 %q", typ)
	}
	return f(cfg)
}

// Registry 聚合多个已启用的知识源，实现 Searcher（对工具层表现为"一个知识库"）。
// 它解决多源的问题：按源名分发、标注 Source、单源失败降级、区分"无命中"与"全失败"。
type Registry struct {
	mu      sync.RWMutex
	sources map[string]Searcher
	order   []string
}

func NewRegistry() *Registry { return &Registry{sources: map[string]Searcher{}} }

// Add 注册（或替换）一个命名知识源。同名重复 Add 覆盖实现、不改变顺序。
func (r *Registry) Add(name string, s Searcher) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if _, dup := r.sources[name]; !dup {
		r.order = append(r.order, name)
	}
	r.sources[name] = s
}

// Sources 返回当前启用的源名列表（稳定顺序，供工具描述/配置页展示）。
func (r *Registry) Sources() []string {
	r.mu.RLock()
	defer r.mu.RUnlock()
	out := make([]string, len(r.order))
	copy(out, r.order)
	return out
}

// Search 检索全部源。
func (r *Registry) Search(ctx context.Context, query string, topK int) ([]Hit, error) {
	return r.SearchSome(ctx, query, topK, nil)
}

// SearchSome 检索指定源（only 空 = 全部）。单源失败跳过（降级）；全部源都失败返回错误，
// 全部源都没命中返回 ErrNoHit——两者语义不同，工具据此给 agent 不同的提示。
func (r *Registry) SearchSome(ctx context.Context, query string, topK int, only []string) ([]Hit, error) {
	r.mu.RLock()
	names := make([]string, len(r.order))
	copy(names, r.order)
	byName := make(map[string]Searcher, len(r.sources))
	for k, v := range r.sources {
		byName[k] = v
	}
	r.mu.RUnlock()

	if len(only) > 0 {
		names = only
	}
	var all []Hit
	var errs []error
	for _, n := range names {
		s, ok := byName[n]
		if !ok {
			continue
		}
		hits, err := s.Search(ctx, query, topK)
		if err != nil {
			errs = append(errs, fmt.Errorf("%s: %w", n, err))
			continue
		}
		for i := range hits {
			hits[i].Source = n
		}
		all = append(all, hits...)
	}
	if len(all) == 0 && len(errs) > 0 {
		return nil, fmt.Errorf("kb: 全部知识源检索失败: %w", errors.Join(errs...))
	}
	if len(all) == 0 {
		return nil, ErrNoHit
	}
	return all, nil
}

// 以下是后端 factory 常用的配置字段提取辅助。cfg 来自 json.Unmarshal 进 map[string]any，
// 数字默认是 float64；为容忍手工配置里的字符串形式，数值类都顺带解析 string。

func cfgStr(cfg map[string]any, key string) string {
	if v, ok := cfg[key]; ok {
		if s, ok := v.(string); ok {
			return strings.TrimSpace(s)
		}
	}
	return ""
}

func cfgFloat(cfg map[string]any, key string, def float64) float64 {
	v, ok := cfg[key]
	if !ok {
		return def
	}
	switch n := v.(type) {
	case float64:
		return n
	case float32:
		return float64(n)
	case int:
		return float64(n)
	case int64:
		return float64(n)
	case string:
		if f, err := strconv.ParseFloat(strings.TrimSpace(n), 64); err == nil {
			return f
		}
	}
	return def
}

func cfgDuration(cfg map[string]any, key string, def time.Duration) time.Duration {
	if v, ok := cfg[key]; ok {
		if s, ok := v.(string); ok && s != "" {
			if d, err := time.ParseDuration(s); err == nil {
				return d
			}
		}
	}
	return def
}
