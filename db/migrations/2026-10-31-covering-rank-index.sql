-- 2026-10-31 榜单查询去掉回表：把 nickname 追加到 players_rank 末尾
-- 前 3 列顺序不变，排序口径（best_score DESC, best_at ASC, openid ASC）不受影响
-- 可重复执行：DROP + CREATE
DROP INDEX IF EXISTS players_rank;
CREATE INDEX IF NOT EXISTS players_rank ON players (best_score DESC, best_at ASC, openid ASC, nickname);