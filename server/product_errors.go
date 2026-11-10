package server

import "net/http"

// productMessage keeps the original detail alongside a stable translation key.
type productMessage struct {
	Code    string         `json:"code"`
	Params  map[string]any `json:"params,omitempty"`
	Message string         `json:"message"`
}

// Preserve error for existing clients and add stable fields for localized UIs.
func writeProductError(w http.ResponseWriter, status int, code, message string, params map[string]any) {
	payload := map[string]any{"error": message, "code": code}
	if len(params) > 0 {
		payload["params"] = params
	}
	writeJSON(w, status, payload)
}
