#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
推送记录模块：所有微信推送都记录到 push_log.json
供网页展示历史
"""
import json
import os
from datetime import datetime, timezone

BASE = "/opt/radar"
PUSH_LOG = os.path.join(BASE, "push_log.json")
MAX_RECORDS = 200


def load_log():
    try:
        with open(PUSH_LOG, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {"records": []}


def save_log(data):
    try:
        data["records"] = data.get("records", [])[:MAX_RECORDS]
        with open(PUSH_LOG, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False)
    except Exception as e:
        print("[pushlog] 保存失败: %s" % e, flush=True)


def record(kind, title, content, summary=None, count=0, items=None, success=True):
    """
    记录一次推送
    kind: 类型（免费资源/GitHub热点/话题调研/心跳）
    title: 标题
    content: 完整的 markdown 内容
    summary: 一句话摘要
    count: 条目数量
    items: 结构化条目（可选，用于网页展示）
    """
    data = load_log()
    rec = {
        "id": int(datetime.now().timestamp() * 1000),
        "at": datetime.now(timezone.utc).isoformat(),
        "kind": kind,
        "title": title,
        "content": content[:6000],  # 限制大小
        "summary": summary or "",
        "count": count,
        "items": (items or [])[:30],
        "success": success,
    }
    data["records"] = [rec] + data.get("records", [])
    data["lastUpdate"] = rec["at"]
    save_log(data)
    return rec


def stats():
    data = load_log()
    recs = data.get("records", [])
    by_kind = {}
    for r in recs:
        k = r.get("kind", "其他")
        by_kind[k] = by_kind.get(k, 0) + 1
    return {
        "total": len(recs),
        "byKind": by_kind,
        "lastUpdate": data.get("lastUpdate"),
    }