package server

import (
	"errors"
	"fmt"
	"net/http"
	"strings"
	"unicode/utf8"

	"github.com/Autumn-27/artex/db"
)

const maxRemarkRunes = db.MaxTaskRemarkRunes

func normalizeRemark(value string) (string, error) {
	value = strings.TrimSpace(value)
	if utf8.RuneCountInString(value) > maxRemarkRunes {
		return "", fmt.Errorf("备注最多 %d 个字符", maxRemarkRunes)
	}
	return value, nil
}

func (s *Server) updateScheduleMetadata(w http.ResponseWriter, r *http.Request) {
	id, err := parseScheduleID(r)
	if err != nil || id <= 0 {
		writeErr(w, 400, "计划编号无效")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxTaskMetadataRequestSize)
	var request struct {
		Name   *string `json:"name"`
		Remark *string `json:"remark"`
	}
	if err := decode(r, &request); err != nil {
		var tooLarge *http.MaxBytesError
		if errors.As(err, &tooLarge) {
			writeErr(w, 413, "请求正文过大")
		} else {
			writeErr(w, 400, err.Error())
		}
		return
	}
	if request.Name == nil && request.Remark == nil {
		writeErr(w, 400, "需要提供 name 或 remark")
		return
	}
	if request.Name != nil {
		name := strings.TrimSpace(*request.Name)
		if name == "" || utf8.RuneCountInString(name) > maxTaskNameRunes {
			writeErr(w, 400, fmt.Sprintf("计划名称须为 1 至 %d 个字符", maxTaskNameRunes))
			return
		}
		request.Name = &name
	}
	if request.Remark != nil {
		remark, err := normalizeRemark(*request.Remark)
		if err != nil {
			writeErr(w, 400, err.Error())
			return
		}
		request.Remark = &remark
	}
	item, err := s.m.pg.UpdateTaskScheduleMetadata(id, db.TaskSchedulePatch{Name: request.Name, Remark: request.Remark})
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	if item == nil {
		writeErr(w, 404, "计划不存在")
		return
	}
	writeJSON(w, 200, item)
}
