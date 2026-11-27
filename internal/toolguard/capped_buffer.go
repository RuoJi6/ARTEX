package toolguard

import (
	"bytes"
	"io"
)

// outputCapture keeps the first limit bytes and discards overflow. With a
// streaming sink it forwards that bounded prefix without buffering it in RAM.
type outputCapture struct {
	buf       bytes.Buffer
	writer    io.Writer
	remaining int
	truncated bool
}

func newOutputCapture(limit int, stream io.Writer) *outputCapture {
	c := &outputCapture{writer: stream, remaining: limit}
	if stream == nil {
		c.writer = &c.buf
	}
	return c
}

func (c *outputCapture) Write(p []byte) (int, error) {
	n := min(c.remaining, len(p))
	if n > 0 {
		if _, err := c.writer.Write(p[:n]); err != nil {
			return 0, err
		}
		c.remaining -= n
	}
	c.truncated = c.truncated || n < len(p)
	return len(p), nil
}

func (c *outputCapture) output() string { return c.buf.String() }
