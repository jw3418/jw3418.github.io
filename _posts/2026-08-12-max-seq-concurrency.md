---
layout: post
title: "MAX(seq) + 1은 동시 요청에 안전할까?"
date: 2026-08-12
categories: [concurrency]
---

# MAX(seq) + 1은 동시 요청에 안전할까?

특정 ID별로 순번을 관리해야 하는 경우 아래처럼 `MAX(seq) + 1`을 이용할 수 있다.

```sql
SELECT NVL(MAX(seq), 0) + 1
FROM history
WHERE id = :id
  AND date = :date;
```

예를 들어 현재 데이터가

```text
A / 20260812 / 1
A / 20260812 / 2
A / 20260812 / 3
```

이라면 다음 순번은 4가 된다.

그런데 동시에 두 요청이 들어오면 문제가 생길 수 있다.

## 동시 요청이 들어오면

현재 `MAX(seq) = 3`인 상황에서 A와 B가 동시에 조회했다고 해보자.

```text
Request A                    Request B

MAX(seq) + 1 → 4            MAX(seq) + 1 → 4

INSERT seq=4                INSERT seq=4
     ↓                           ↓
   성공                       PK 충돌
```

`SELECT MAX(seq) + 1`과 `INSERT`가 하나의 원자적인 연산이 아니기 때문에 두 요청이 같은 seq를 가져갈 수 있다.

복합 PK가 다음과 같이 설정되어 있다면

```text
PK (id, date, seq)
```

중복 데이터가 실제로 저장되지는 않지만, 나중에 INSERT한 요청은 PK 중복으로 실패한다.

## Retry

충돌한 요청에서 seq를 다시 조회하고 INSERT를 다시 시도하는 방법을 사용할 수 있다.

```java
for (int retry = 0; retry < 3; retry++) {

    try {
        int seq = mapper.selectNextSeq(id, date);

        mapper.insert(id, date, seq);

        break;

    } catch (DuplicateKeyException e) {

        if (retry == 2) {
            throw e;
        }
    }
}
```

A가 먼저 `seq=4`를 저장했다면 B가 retry할 때는

```text
MAX(seq) + 1 → 5
INSERT seq=5 → 성공
```

하게 된다.

중요한 점은 INSERT만 다시 하는 게 아니라 **seq 조회부터 다시 해야 한다는 것**이다.

## 이게 동시성을 막는 건가?

정확히는 동시 요청 자체를 막는 방식은 아니다.

두 요청이 같은 seq를 가져가는 Race Condition은 여전히 발생할 수 있다.

대신

```text
동일 seq 계산
    ↓
INSERT
    ↓
PK Constraint로 충돌 감지
    ↓
실패한 요청 Retry
```

방식으로 충돌 이후에 복구한다.

따라서 `MAX(seq) + 1 + Retry` 방식은 충돌이 많지 않은 상황이라면 비교적 간단하게 사용할 수 있다.

반대로 동일한 ID에 동시 요청이 많이 발생한다면 retry 역시 계속 충돌할 수 있기 때문에 다른 방법을 고려해야 한다.

## Oracle Sequence는?

Oracle Sequence를 사용하면 동시성 문제 없이 증가하는 값을 얻을 수 있다.

```sql
SELECT MY_SEQ.NEXTVAL
FROM DUAL;
```

하지만 Sequence는 기본적으로 전체에서 증가한다.

```text
1 → 2 → 3 → 4 → 5 ...
```

반면 아래처럼 ID와 날짜별로 순번이 각각 필요하다면

```text
A / 20260812 → 1, 2, 3 ...
B / 20260812 → 1, 2, 3 ...
A / 20260813 → 1, 2, 3 ...
```

단순히 하나의 Oracle Sequence를 사용하는 것으로는 해결하기 어렵다.

이런 경우에는 별도의 순번 관리 방식이나 Lock 등을 고려할 수 있다.

## 정리

`MAX(seq) + 1`은 동시 요청에 안전한 방식은 아니다.

다만 PK Constraint가 있다면 중복 데이터 저장 자체는 DB에서 막을 수 있고, PK 충돌이 발생한 요청에 한해 seq를 다시 조회해서 retry하는 방법을 사용할 수 있다.

결국

```text
MAX(seq) + 1
→ PK Constraint
→ DuplicateKeyException
→ seq 재조회
→ Retry
```

구조라고 볼 수 있다.

충돌이 드물다면 단순하게 사용할 수 있지만, 충돌이 자주 발생하는 환경이라면 Lock이나 순번 생성 구조 자체를 다시 검토할 필요가 있다.
