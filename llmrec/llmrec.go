// Package llmrec implements a recording decorator for llm.Provider. It intercepts
// every Stream call, captures the full request and accumulated response, and
// persists them to PostgreSQL for later inspection.
package llmrec

import (
	"context"
	"encoding/json"
	"iter"
	"log"
	"strings"
	"time"

	"github.com/Autumn-27/artex/db"
	"github.com/Autumn-27/norma/llm"
	"github.com/Autumn-27/norma/transcript"
)

type taskIDContextKey struct{}
type workerContextKey struct{}

// WithTaskID attaches the owning task registry id to an LLM call. Session ids
// are based on exploration ids, which are not interchangeable with task ids.
func WithTaskID(ctx context.Context, taskID string) context.Context {
	taskID = strings.TrimSpace(taskID)
	if taskID == "" {
		return ctx
	}
	return context.WithValue(ctx, taskIDContextKey{}, taskID)
}

// TaskIDFrom returns the explicit task registry id attached by the task runtime.
func TaskIDFrom(ctx context.Context) string {
	if ctx == nil {
		return ""
	}
	taskID, _ := ctx.Value(taskIDContextKey{}).(string)
	return strings.TrimSpace(taskID)
}

// WithWorker overrides the agent-lane ("worker") label for an LLM call. The lane
// is normally parsed from the transcript session id (exp<N>-<role>); calls made
// outside the engine's worker/planner sessions — e.g. the intercept fallback judge
// — carry no such session, so they attach their lane explicitly here. This lets the
// usage ledger single out that spend (worker='judge') for the config page.
func WithWorker(ctx context.Context, worker string) context.Context {
	worker = strings.TrimSpace(worker)
	if worker == "" {
		return ctx
	}
	return context.WithValue(ctx, workerContextKey{}, worker)
}

// workerFrom returns the explicit lane override, or "" when none is set.
func workerFrom(ctx context.Context) string {
	if ctx == nil {
		return ""
	}
	worker, _ := ctx.Value(workerContextKey{}).(string)
	return strings.TrimSpace(worker)
}

// Recorder wraps an llm.Provider and records every completion call.
type Recorder struct {
	inner llm.Provider
	pg    *db.DB
	model string // model name (from config, not in CompletionRequest)
	prof  string // LLM profile name (from llm_profiles)
	// thinkingType / reasoningEffort 是配置级思考参数(思考开关 / 思考强度)。它们在
	// norma 的 buildBody() 里从 provider 配置注入真正的 HTTP body,不出现在
	// CompletionRequest 上,故 Recorder 需在此单独带一份,序列化时写进录制。
	thinkingType    string
	reasoningEffort string
	enabled         func() bool // reports whether recording is currently on; nil = always record
}

// Wrap returns a Provider that records calls to pg when enabled() reports true.
// profName is the LLM profile name (e.g. "default"); may be empty. thinkingType /
// reasoningEffort are the config-level thinking params actually sent to the API
// (empty = not sent). A nil enabled predicate records unconditionally.
func Wrap(inner llm.Provider, pg *db.DB, model, profName, thinkingType, reasoningEffort string, enabled func() bool) *Recorder {
	return &Recorder{
		inner: inner, pg: pg, model: model, prof: profName,
		thinkingType: thinkingType, reasoningEffort: reasoningEffort, enabled: enabled,
	}
}

// parseSession extracts task id and worker role from session strings like
// "exp1-worker-i3" → ("1", "worker") or "exp2-planner" → ("2", "planner").
func parseSession(s string) (taskID, worker string) {
	// format: exp<N>-<role>[-suffix]
	if !strings.HasPrefix(s, "exp") {
		return "", ""
	}
	rest := s[3:] // after "exp"
	// split task number
	i := strings.IndexByte(rest, '-')
	if i < 0 {
		return rest, ""
	}
	taskID = rest[:i]
	rest = rest[i+1:]
	// worker role is up to the next '-' (e.g. "worker" from "worker-i3")
	if j := strings.IndexByte(rest, '-'); j >= 0 {
		worker = rest[:j]
	} else {
		worker = rest
	}
	return taskID, worker
}

// Stream implements llm.Provider. It delegates to the inner provider, accumulates
// the streamed events to reconstruct the response, and records the full exchange.
//
// The session identifier (e.g. "exp1-worker-i3") is carried on ctx by the norma
// harness via transcript.WithSessionID; reading it per-call is race-free even when
// planner and multiple workers share one Recorder instance.
func (r *Recorder) Stream(ctx context.Context, req llm.CompletionRequest) iter.Seq2[llm.StreamEvent, error] {
	// Body recording (the heavy debug trace: full request/response) is gated by the
	// llm_record setting. Lightweight usage metering always runs — it powers token
	// stats and must be complete even for interrupted/failed runs, so it is NOT
	// gated. Only body serialization + response accumulation are skipped when off.
	recordBodies := r.enabled == nil || r.enabled()
	start := time.Now()
	session := transcript.SessionIDFrom(ctx)
	parsedID, worker := parseSession(session)
	if ov := workerFrom(ctx); ov != "" {
		worker = ov
	}
	expID := db.ParseExpID(parsedID)
	taskID := TaskIDFrom(ctx)
	if taskID == "" {
		// Backward compatibility for non-task callers. For task calls, the task
		// runtime always supplies the registry id explicitly.
		taskID = parsedID
	}

	// Serialize the request only when storing bodies (this is the expensive part).
	// Alongside it, attach a Capture so the HTTP transport can hand back the
	// untouched wire bodies — the normalized view below cannot reconstruct them
	// (tool schemas are dropped, tool_use blocks never reach this layer, and the
	// SSE framing is already decoded). See capture.go.
	reqBody := ""
	var capt *Capture
	if recordBodies {
		reqBody = r.serializeRequest(req)
		ctx, capt = NewCapture(ctx)
	}

	return func(yield func(llm.StreamEvent, error) bool) {
		var (
			textBuf     strings.Builder
			thinkingBuf strings.Builder
			usage       llm.Usage
			stopReason  string
			streamErr   error
		)

		for attempt := 0; ; attempt++ {
			res := r.streamAttempt(ctx, req, recordBodies, yield)
			textBuf.Reset()
			textBuf.WriteString(res.text)
			thinkingBuf.Reset()
			thinkingBuf.WriteString(res.thinking)
			usage, stopReason, streamErr = res.usage, res.stopReason, res.err

			if res.stopped || res.err != nil || !res.empty {
				break
			}
			if attempt >= emptyResponseRetries {
				// 重试耗尽仍是空响应：把元数据事件吐给调用方，保持「正常结束」观感
				for _, p := range res.pending {
					if !yield(p, nil) {
						break
					}
				}
				break
			}
			// 空响应且还有重试额度：丢弃本轮的元数据，重试下一轮
		}

		if streamErr == nil && ctx.Err() != nil {
			streamErr = ctx.Err()
		}
		status := "ok"
		if streamErr != nil {
			status = "error"
		}
		// Lightweight metering row — always written.
		r.recordUsage(taskID, expID, worker, usage, int(time.Since(start).Milliseconds()), status)
		// Heavy trace row — only when body recording is on.
		if recordBodies {
			r.record(req, session, taskID, worker, reqBody, capt, start, textBuf.String(), thinkingBuf.String(), usage, stopReason, streamErr)
		}
	}
}

// streamAttemptResult 汇总一次 inner.Stream 的结果。
type streamAttemptResult struct {
	text        string
	thinking    string
	usage       llm.Usage
	stopReason  string
	contentSeen bool              // 是否出现过内容事件(文本/思考/工具)
	empty       bool              // 流结束仍无任何内容块
	stopped     bool              // 调用方通过 yield 返回 false 主动停止
	pending     []llm.StreamEvent // 空响应时被压住的元数据事件(message_start/message_delta/message_stop)
	err         error             // 流内错误
}

// streamAttempt 跑一次 inner.Stream。开头的元数据事件先压住，直到出现第一个
// 内容事件(文本/思考/工具)才按顺序吐出，从而在不破坏实时流式的前提下探测
// 「完成但零内容」的空响应：空响应时不吐元数据，交由上层重试。
func (r *Recorder) streamAttempt(ctx context.Context, req llm.CompletionRequest, recordBodies bool, yield func(llm.StreamEvent, error) bool) streamAttemptResult {
	var (
		textBuf     strings.Builder
		thinkingBuf strings.Builder
		res         streamAttemptResult
	)
	next, stop := iter.Pull2(r.inner.Stream(ctx, req))
	defer stop()

	for {
		ev, e, ok := next()
		if !ok {
			break
		}
		if e != nil {
			// 流内错误：照原样交给调用方，不重试
			res.err = e
			res.empty = !res.contentSeen
			yield(ev, e)
			res.stopped = true
			res.text, res.thinking = textBuf.String(), thinkingBuf.String()
			return res
		}
		switch ev.Type {
		case llm.SEMessageStart:
			res.usage.Add(ev.Usage)
		case llm.SEMessageDelta:
			if ev.StopReason != "" {
				res.stopReason = ev.StopReason
			}
			res.usage.Add(ev.Usage)
		}
		if recordBodies {
			switch ev.Type {
			case llm.SETextDelta:
				textBuf.WriteString(ev.Text)
			case llm.SEThinkingDelta:
				thinkingBuf.WriteString(ev.Text)
			}
		}
		if !res.contentSeen {
			if isContentEvent(ev.Type) {
				res.contentSeen = true
				for _, p := range res.pending {
					if !yield(p, nil) {
						res.stopped = true
						res.text, res.thinking = textBuf.String(), thinkingBuf.String()
						return res
					}
				}
				res.pending = nil
				if !yield(ev, nil) {
					res.stopped = true
					res.text, res.thinking = textBuf.String(), thinkingBuf.String()
					return res
				}
			} else {
				res.pending = append(res.pending, ev)
			}
		} else if !yield(ev, nil) {
			res.stopped = true
			res.text, res.thinking = textBuf.String(), thinkingBuf.String()
			return res
		}
	}

	res.text, res.thinking = textBuf.String(), thinkingBuf.String()
	res.empty = !res.contentSeen
	return res
}

// Complete implements the atomic completion path while preserving the same
// usage metering, normalized body recording and raw wire capture as Stream. It
// also retries empty completions (0 text/tool/thinking), mirroring Stream.
func (r *Recorder) Complete(ctx context.Context, req llm.CompletionRequest) (llm.Message, string, llm.Usage, error) {
	recordBodies := r.enabled == nil || r.enabled()
	start := time.Now()
	session := transcript.SessionIDFrom(ctx)
	parsedID, worker := parseSession(session)
	if ov := workerFrom(ctx); ov != "" {
		worker = ov
	}
	expID := db.ParseExpID(parsedID)
	taskID := TaskIDFrom(ctx)
	if taskID == "" {
		taskID = parsedID
	}

	reqBody := ""
	var capt *Capture
	if recordBodies {
		reqBody = r.serializeRequest(req)
		ctx, capt = NewCapture(ctx)
	}

	msg, stopReason, usage, err := r.inner.Complete(ctx, req)
	for attempt := 0; attempt < emptyResponseRetries && err == nil && emptyMessage(msg); attempt++ {
		msg, stopReason, usage, err = r.inner.Complete(ctx, req)
	}
	status := "ok"
	if err != nil {
		status = "error"
	}
	r.recordUsage(taskID, expID, worker, usage, int(time.Since(start).Milliseconds()), status)
	if recordBodies {
		r.record(req, session, taskID, worker, reqBody, capt, start, msg.Text(), thinkingText(msg), usage, stopReason, err)
	}
	return msg, stopReason, usage, err
}

func thinkingText(msg llm.Message) string {
	var b strings.Builder
	for _, block := range msg.Content {
		if block.Type == llm.BlockThinking && block.Thinking != "" {
			b.WriteString(block.Thinking)
		}
	}
	return b.String()
}

// emptyResponseRetries 是 SDK 之上对「完成但零内容」空响应的重试次数。norma 的
// EmptyResponseRetries 只对 openai 格式生效，这里在 Recorder 层对所有格式补齐，
// 避免 5.5 代等模型返回空流时被静默当成正常结束。
const emptyResponseRetries = 2

// isContentEvent 判断一个流事件是否属于「实质内容」：文本、思考或工具调用。
// message_start / message_delta / message_stop 只是元数据，不算内容。
func isContentEvent(t llm.StreamEventType) bool {
	switch t {
	case llm.SETextDelta, llm.SEThinkingDelta, llm.SEToolUseStart, llm.SEToolInputJSON:
		return true
	}
	return false
}

// emptyMessage 判断一个非流式响应是否为「零内容」：没有任何文本/思考/工具调用块。
func emptyMessage(msg llm.Message) bool {
	for _, b := range msg.Content {
		switch b.Type {
		case llm.BlockText:
			if b.Text != "" {
				return false
			}
		case llm.BlockThinking:
			if b.Thinking != "" {
				return false
			}
		case llm.BlockToolUse:
			return false
		}
	}
	return true
}

// recordUsage appends one lightweight metering row to llm_usage (no bodies). Skips
// zero-token calls with no model, which carry nothing worth metering.
func (r *Recorder) recordUsage(taskID string, expID int64, worker string, usage llm.Usage, latencyMs int, status string) {
	if r.pg == nil {
		return
	}
	if r.model == "" && usage.InputTokens == 0 && usage.OutputTokens == 0 &&
		usage.CacheReadTokens == 0 && usage.CacheWriteTokens == 0 {
		return
	}
	err := r.pg.InsertLLMUsage(&db.LLMUsage{
		TaskID:        taskID,
		ExplorationID: expID,
		Worker:        worker,
		Model:         r.model,
		ProfileName:   r.prof,
		LatencyMs:     latencyMs,
		InputTokens:   usage.InputTokens,
		OutputTokens:  usage.OutputTokens,
		CacheRead:     usage.CacheReadTokens,
		CacheWrite:    usage.CacheWriteTokens,
		Status:        status,
	})
	if err != nil {
		log.Printf("[llmusage] insert: %v", err)
	}
}

// record persists one LLM call to PostgreSQL before the provider stream returns.
// Keeping the write inside the owning task operation means task deletion can
// drain calls and then remove records without a late async insert recreating one.
func (r *Recorder) record(req llm.CompletionRequest, session, taskID, worker, reqBody string, capt *Capture, start time.Time, text, thinking string, usage llm.Usage, stopReason string, streamErr error) {
	latency := int(time.Since(start).Milliseconds())
	status := "ok"
	errMsg := ""
	if streamErr != nil {
		status = "error"
		errMsg = streamErr.Error()
	}

	// Build response body JSON.
	resp := map[string]any{
		"text":        text,
		"stop_reason": stopReason,
		"usage": map[string]int{
			"input_tokens":       usage.InputTokens,
			"output_tokens":      usage.OutputTokens,
			"cache_read_tokens":  usage.CacheReadTokens,
			"cache_write_tokens": usage.CacheWriteTokens,
		},
	}
	if thinking != "" {
		resp["thinking"] = thinking
	}
	if text == "" && thinking == "" {
		resp["empty"] = true
	}
	respBody, _ := json.Marshal(resp)

	model := ""
	if len(req.System) > 0 {
		// model is not in CompletionRequest; use the configured model name
	}
	model = r.model

	rec := &db.LLMRecord{
		SessionID:    session,
		TaskID:       taskID,
		Worker:       worker,
		Model:        model,
		ProfileName:  r.prof,
		LatencyMs:    latency,
		InputTokens:  usage.InputTokens,
		OutputTokens: usage.OutputTokens,
		CacheRead:    usage.CacheReadTokens,
		CacheWrite:   usage.CacheWriteTokens,
		Status:       status,
		Error:        errMsg,
		RequestBody:  reqBody,
		ResponseBody: string(respBody),
		// Raw wire bodies; empty when the transport did not fill the Capture
		// (e.g. a provider dialing through a client without the capture hook, or
		// a call that failed before any HTTP request went out).
		RawRequest:  capt.RawRequest(),
		RawResponse: capt.RawResponse(),
	}

	if err := r.pg.InsertLLMRecord(rec); err != nil {
		log.Printf("[llmrec] insert: %v", err)
	}
}

// serializeRequest builds a JSON representation of the completion request.
func (r *Recorder) serializeRequest(req llm.CompletionRequest) string {
	m := map[string]any{
		"system":     req.System,
		"messages":   req.Messages,
		"max_tokens": req.MaxTokens,
	}
	// 记录本次调用实际发出的思考参数。type 采用「有效值」：每请求覆盖 req.Thinking
	// 优先于配置级 thinkingType(与 norma buildBody 的判定一致，如 compaction 摘要会
	// 强制 disabled)；effort 无每请求覆盖，直接取配置值。两者皆空则不写 thinking 字段。
	effType := r.thinkingType
	if req.Thinking != "" {
		effType = req.Thinking
	}
	if effType != "" || r.reasoningEffort != "" {
		m["thinking"] = map[string]string{"type": effType, "effort": r.reasoningEffort}
	}
	if len(req.Tools) > 0 {
		// Store tool names only (full schemas are huge).
		names := make([]string, len(req.Tools))
		for i, t := range req.Tools {
			names[i] = t.Name
		}
		m["tools"] = names
		m["tools_count"] = len(req.Tools)
	}
	if req.Temperature != nil {
		m["temperature"] = *req.Temperature
	}
	if len(req.Stop) > 0 {
		m["stop"] = req.Stop
	}
	b, _ := json.Marshal(m)
	return string(b)
}
