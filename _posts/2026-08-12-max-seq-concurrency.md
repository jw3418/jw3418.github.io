---
layout: default
title: "MAX(seq) + 1은 동시 요청에 안전할까?"
date: 2026-08-12
---

## 문제 상황

순번을 다음과 같이 생성한다고 가정한다.

```sql
SELECT NVL(MAX(seq), 0) + 1
FROM offer_history
WHERE offer_id = ?
