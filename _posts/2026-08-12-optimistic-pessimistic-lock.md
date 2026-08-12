---
layout: post
title: "UPDATE 동시성 문제와 낙관적 락, 비관적 락"
date: 2026-08-12
---

# UPDATE 동시성 문제와 낙관적 락, 비관적 락

DB에서 같은 row를 동시에 수정하면 어떻게 될까?

Oracle에서는 UPDATE가 수행되면 해당 row에 lock이 걸린다.

예를 들어 A가 먼저 UPDATE를 수행하고 아직 COMMIT하지 않은 상태에서 B가 같은 row를 UPDATE하면 B는 A의 트랜잭션이 끝날 때까지 기다린다.

```text
Transaction A              Transaction B

UPDATE
  ↓
Row Lock

                            UPDATE
                              ↓
                             WAIT

COMMIT
  ↓
Lock 해제
                              ↓
                            UPDATE
```

그렇다면 Oracle이 알아서 lock을 걸어주는데 별도의 동시성 처리가 왜 필요할까?

## Lost Update

문제는 DB가 UPDATE를 순서대로 실행해준다고 해서 애플리케이션 관점의 데이터 정합성까지 보장되는 것은 아니라는 점이다.

예를 들어 최초 값이 다음과 같다고 하자.

```text
amount = 10000
```

A와 B가 거의 동시에 이 값을 읽는다.

```text
A → 10000 조회
B → 10000 조회
```

이후 각각 다른 값으로 수정한다.

```text
A → 15000으로 UPDATE
B → 20000으로 UPDATE
```

Oracle은 두 UPDATE를 동시에 실행하지 않고 row lock을 통해 순서대로 처리한다.

하지만 최종 결과는

```text
amount = 20000
```

이 된다.

A가 변경한 값이 B에 의해 덮어써진 것이다.

이런 문제를 Lost Update라고 한다.

---

## 부분 UPDATE라면?

다만 항상 문제가 생기는 것은 아니다.

예를 들어 최초 데이터가

```text
x = 1
y = 1
z = 1
```

이고 A와 B가 서로 다른 컬럼만 수정한다고 하자.

A:

```sql
UPDATE example
SET x = 2,
    y = 2
WHERE id = 1;
```

B:

```sql
UPDATE example
SET z = 2
WHERE id = 1;
```

두 UPDATE가 순서대로 실행되면 최종 결과는

```text
x = 2
y = 2
z = 2
```

가 된다.

서로 다른 컬럼을 수정했기 때문에 한쪽의 변경이 사라지지 않는다.

반대로 같은 컬럼을 수정한다면

```text
A → x = 2
B → x = 3
```

최종적으로 나중에 실행된 값이 남는다.

```text
x = 3
```

따라서 같은 row를 수정한다는 이유만으로 항상 별도의 동시성 처리가 필요한 것은 아니다.

동시에 어떤 데이터를 수정할 수 있는지와 마지막 요청의 값이 남아도 되는지를 먼저 판단해야 한다.

---

## 낙관적 락 (Optimistic Lock)

낙관적 락은 실제로 데이터를 미리 잠그지 않는다.

대신

> 데이터를 읽은 이후 다른 요청이 수정했는지 확인한다.

라는 방식으로 동작한다.

예를 들어 VERSION 컬럼을 사용할 수 있다.

최초 데이터:

```text
amount = 10000
version = 1
```

A와 B가 동시에 조회하면 둘 다 `version = 1`을 가지고 있다.

A가 수정한다.

```sql
UPDATE example
SET amount = 15000,
    version = version + 1
WHERE id = 1
  AND version = 1;
```

성공하면 DB는

```text
amount = 15000
version = 2
```

가 된다.

이후 B가 자신이 가지고 있던 `version = 1`로 UPDATE를 시도하면

```sql
UPDATE example
SET amount = 20000,
    version = version + 1
WHERE id = 1
  AND version = 1;
```

현재 DB의 version은 이미 2이므로 UPDATE되는 row가 없다.

```text
updateCount = 0
```

이를 통해 다른 요청이 먼저 데이터를 변경했다는 것을 알 수 있다.

즉 낙관적 락은

```text
Lock을 미리 잡음 X

수정 시
"내가 읽었던 데이터가 아직 그대로인가?"
확인
```

하는 방식이다.

충돌이 자주 발생하지 않는 환경에서 사용하기 좋다.

---

## 수정시간을 이용할 수도 있다

별도의 VERSION 컬럼 대신 최종 수정시간을 이용할 수도 있다.

예를 들어 조회 당시

```text
AUDIT_DTM = T1
```

이었다면 UPDATE 시 기존 값을 조건으로 사용한다.

```sql
UPDATE example
SET amount = 15000,
    audit_dtm = SYSDATE
WHERE id = 1
  AND audit_dtm = :previousAuditDtm;
```

다른 요청이 먼저 수정했다면 `AUDIT_DTM`이 이미 변경되었기 때문에 UPDATE 결과가 0건이 된다.

다만 수정시간은 원래 audit 목적의 데이터이기 때문에, 가능하다면 동시성 제어용 VERSION 컬럼을 별도로 두는 편이 역할이 더 명확하다.

---

## 비관적 락 (Pessimistic Lock)

비관적 락은 반대로

> 어차피 충돌할 가능성이 있으니 처음부터 데이터를 잠근다.

는 방식이다.

Oracle에서는 대표적으로 `SELECT FOR UPDATE`를 사용할 수 있다.

```sql
SELECT *
FROM example
WHERE id = 1
FOR UPDATE;
```

A가 먼저 실행하면 해당 row에 lock을 획득한다.

```text
Transaction A               Transaction B

SELECT FOR UPDATE
       ↓
     LOCK

                             SELECT FOR UPDATE
                                    ↓
                                   WAIT

UPDATE

COMMIT
   ↓
LOCK 해제
                                    ↓
                                  진행
```

A가 COMMIT 또는 ROLLBACK해서 lock을 해제하기 전까지 B는 기다리게 된다.

따라서 동시에 같은 데이터를 수정하는 것을 강하게 제어할 수 있다.

대신 lock을 오래 가지고 있거나 동일한 row에 요청이 몰리면 대기 시간이 증가할 수 있다.

---

## 낙관적 락 vs 비관적 락

간단하게 정리하면 다음과 같다.

| | 낙관적 락 | 비관적 락 |
|---|---|---|
| 기본 생각 | 충돌이 별로 없을 것이다 | 충돌이 발생할 것이다 |
| 실제 Lock 선점 | X | O |
| 대표적인 방법 | VERSION 비교 | SELECT FOR UPDATE |
| 충돌 발생 시 | UPDATE 실패 감지 | 다른 요청 대기 |
| 장점 | 동시 처리에 유리 | 데이터 충돌을 강하게 제어 |
| 단점 | 충돌 처리 필요 | Lock 대기 발생 가능 |

---

## 모든 UPDATE에 락 전략이 필요한 것은 아니다

동시성 문제를 공부하면서 처음에는 같은 row를 수정하면 무조건 낙관적 락이나 비관적 락을 적용해야 한다고 생각하기 쉽다.

하지만 실제로는 요구사항을 먼저 봐야 한다.

예를 들어 변경된 컬럼만 부분 UPDATE하는 API에서

```text
A → x, y 수정
B → z 수정
```

처럼 서로 다른 컬럼을 수정한다면 두 변경사항을 모두 유지할 수 있다.

반면

```text
A → x = 2
B → x = 3
```

처럼 같은 값을 동시에 수정한다면 마지막 UPDATE가 앞선 UPDATE를 덮어쓸 수 있다.

이때도 서비스 정책상 Last Write Wins를 허용한다면 별도의 락이 필요하지 않을 수 있다.

결국 중요한 것은 단순히

```text
"동시 수정 → Lock 필요"
```

라고 판단하는 것이 아니라,

```text
어떤 동시 수정이 가능한가?
        ↓
실제로 데이터가 유실될 수 있는가?
        ↓
Last Write Wins를 허용하는가?
        ↓
허용하지 않는다면 어떤 방식으로 제어할 것인가?
```

순서로 판단하는 것이다.

낙관적 락과 비관적 락은 그 문제를 해결하기 위한 선택지 중 하나다.
