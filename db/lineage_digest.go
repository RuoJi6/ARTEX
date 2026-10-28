package db

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
)

var ErrLineageDigestSnapshotChanged = errors.New("lineage digest snapshot changed")

type LineageDigestCheck func(*sql.Tx) error

func (s *ExplorationStore) DigestMembersFor(digestIDs []int64) (map[int64][]int64, error) {
	members := make(map[int64][]int64, len(digestIDs))
	if len(digestIDs) == 0 {
		return members, nil
	}
	args := make([]any, 0, len(digestIDs)+2)
	args = append(args, s.expID, RelCovers)
	marks := make([]string, 0, len(digestIDs))
	for _, id := range digestIDs {
		args = append(args, id)
		marks = append(marks, "$"+fmt.Sprint(len(args)))
		members[id] = []int64{}
	}
	rows, err := s.db.Query(`SELECT src_id, dst_id FROM exploration_edges
WHERE exploration_id=$1 AND rel=$2 AND src_id IN (`+strings.Join(marks, ",")+`) ORDER BY src_id, dst_id`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var digestID, memberID int64
		if err := rows.Scan(&digestID, &memberID); err != nil {
			return nil, err
		}
		members[digestID] = append(members[digestID], memberID)
	}
	return members, rows.Err()
}

func (s *ExplorationStore) ContentVersionsTx(tx *sql.Tx) (map[int64]int, error) {
	rows, err := tx.Query(`SELECT id, content_version FROM exploration_nodes WHERE exploration_id=$1`, s.expID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	versions := map[int64]int{}
	for rows.Next() {
		var id int64
		var version int
		if err := rows.Scan(&id, &version); err != nil {
			return nil, err
		}
		versions[id] = version
	}
	return versions, rows.Err()
}

func (s *ExplorationStore) ReadGraphTx(tx *sql.Tx) ([]*Node, []Edge, error) {
	rows, err := tx.Query(`SELECT `+nodeCols+` FROM exploration_nodes WHERE exploration_id=$1 ORDER BY id`, s.expID)
	if err != nil {
		return nil, nil, err
	}
	nodes, err := scanNodes(rows)
	rows.Close()
	if err != nil {
		return nil, nil, err
	}
	rows, err = tx.Query(`SELECT src_id, rel, dst_id FROM exploration_edges WHERE exploration_id=$1`, s.expID)
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()
	var edges []Edge
	for rows.Next() {
		var edge Edge
		if err := rows.Scan(&edge.From, &edge.Rel, &edge.To); err != nil {
			return nil, nil, err
		}
		edges = append(edges, edge)
	}
	return nodes, edges, rows.Err()
}

func (s *ExplorationStore) AddLineageDigestChecked(ctx context.Context, payload map[string]any, memberIDs []int64, check LineageDigestCheck) (int64, error) {
	raw, err := json.Marshal(payload)
	if err != nil {
		return 0, err
	}
	tx, err := s.db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelSerializable})
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()
	// Serializable isolation alone can order this transaction before a writer
	// that commits first in real time. The short table write gate closes that
	// window for every node and edge writer without requiring writer cooperation.
	if _, err := tx.ExecContext(ctx, `LOCK TABLE exploration_nodes, exploration_edges IN SHARE ROW EXCLUSIVE MODE`); err != nil {
		return 0, err
	}
	if check != nil {
		if err := check(tx); err != nil {
			return 0, err
		}
	}
	var id int64
	if err := tx.QueryRowContext(ctx, `
INSERT INTO exploration_nodes(exploration_id, kind, payload, priority, state, origin)
VALUES ($1, $2, $3, 0, $4, 'compactor') RETURNING id`,
		s.expID, KindDigest, string(raw), StateDigestActive).Scan(&id); err != nil {
		return 0, err
	}
	for _, memberID := range memberIDs {
		if _, err := tx.ExecContext(ctx, `
INSERT INTO exploration_edges(exploration_id, src_id, rel, dst_id) VALUES ($1,$2,$3,$4)
ON CONFLICT (exploration_id, src_id, rel, dst_id) DO NOTHING`, s.expID, id, RelCovers, memberID); err != nil {
			return 0, err
		}
	}
	return id, tx.Commit()
}
