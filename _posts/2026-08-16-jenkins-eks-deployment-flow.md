---
layout: post
title: "Kubernetes 서비스 배포 흐름 이해하기"
date: 2026-08-16
categories: [CI/CD]
---

# Kubernetes 서비스 배포 흐름 이해하기

Kubernetes 기반의 서비스를 운영하면서 Jenkins를 통해 개발 환경에 애플리케이션을 배포할 일이 많았다.

개발한 코드를 Push하고 Jenkins Pipeline을 실행하면 빌드가 진행되고, 잠시 뒤 EKS의 Pod가 새로운 버전으로 교체된다.

처음에는 이를 단순히

```text
Jenkins
   ↓
EKS 배포
```

정도로 이해하고 있었다.

그런데 실제 인프라 구조를 보다 보니 한 가지가 잘 이해되지 않았다.

**Jenkins는 별도의 EC2 Instance에서 실행되고 있는데, 어떻게 EKS 안의 Pod를 변경할 수 있는 것일까?**

```mermaid
flowchart LR
    subgraph EC2["EC2 Instance"]
        J["Jenkins"]
    end

    subgraph EKS["EKS Cluster"]
        D["Deployment"] --> P["Pod"]
    end

    J -. "ㅇㅇ?" .-> D
```

처음에는 Jenkins가 빌드한 애플리케이션을 EKS에 직접 전달하는 것처럼 생각했다.

하지만 실제 배포 흐름을 따라가 보니 조금 달랐다.

Jenkins는 **실행할 Container Image를 Registry에 준비하고, Kubernetes에는 어떤 버전을 실행해야 하는지 상태 변경을 요청한다.**

그리고 실제로 새로운 Pod를 만들고 실행 상태를 변경하는 것은 Kubernetes다.

이 글에서는 Jenkins에서 배포를 시작했을 때 **Application이 Container Image로 빌드되고, 해당 Image가 Kubernetes에서 실제 Pod로 실행되기까지의 과정**을 살펴보고자 한다.

---

## Jenkins는 배포를 직접 수행하는 시스템일까?

Jenkins 자체를 보면 특별한 배포 장비가 있는 것은 아니다.

예를 들어 Jenkins Controller가 별도의 EC2 Instance에서 실행되는 구조를 생각해볼 수 있다.

Jenkins는 이 서버에서 Pipeline에 정의된 작업을 실행한다.

```bash
./gradlew build

docker build ...

docker push ...

helm upgrade ...
```

환경에 따라 실제 작업은 Jenkins Controller가 아니라 별도의 Jenkins Agent에서 수행될 수도 있다.

여기서 중요한 점은 Jenkins가 EKS 내부에서 실행되고 있기 때문에 배포할 수 있는 것이 아니라는 것이다.

Jenkins의 역할은 **배포에 필요한 작업을 정해진 순서대로 실행하는 것**이다.

그렇다면 실제 배포 과정에서는 무엇이 전달되는 것일까?

---

## 배포 흐름을 두 부분으로 나눠보기

Jenkins Pipeline을 따라가 보면 Kubernetes 배포는 크게 두 흐름으로 나눌 수 있다.

첫 번째는 **실행할 Artifact를 준비하는 과정**이고, 두 번째는 **Kubernetes가 새로운 Artifact를 실행하도록 상태를 변경하는 과정**이다.

두 흐름을 함께 보면 다음과 같다.

```mermaid
flowchart LR
    G["Git Repository"] --> J["Jenkins"]

    J --> B["Application Build"]
    B --> I["Container Image Build"]
    I --> E["ECR"]

    J --> H["Helm / kubectl"]
    H --> API["Kubernetes API"]
    API --> D["Deployment 변경"]

    D --> P["New Pod"]
    E -. "Image Pull" .-> P
```

여기서 처음 생각했던 구조와 실제 구조의 차이가 드러난다.

```text
처음 생각

Jenkins
   ↓
Application 전달
   ↓
Pod


실제 흐름

Jenkins
   ├── Container Image → ECR
   │
   └── Deployment 변경 → Kubernetes API
```

즉 **Application Artifact와 배포 명령은 서로 다른 경로로 전달된다.**

이 구분이 Jenkins 기반 Kubernetes 배포를 이해하는 첫 번째 핵심이었다.

---

## Jenkins가 만드는 것은 실행 가능한 Image다

먼저 Artifact가 전달되는 흐름을 보자.

Jenkins는 Source Code를 빌드하고 Container Image를 만든다.

```mermaid
flowchart LR
    S["Source Code"] --> B["Application Build"]
    B --> I["Container Image"]
    I --> E["ECR"]
```

생성된 Image를 EKS의 Pod에 직접 복사하지는 않는다.

Image는 ECR과 같은 Container Registry에 Push된다.

예를 들어 배포마다 다음과 같은 Image가 만들어질 수 있다.

```text
my-service:20260816-a1b2c3
my-service:20260816-d4e5f6
```

이 시점에는 아직 새로운 Application이 실행된 것이 아니다.

**Kubernetes가 나중에 가져가서 실행할 Artifact가 준비된 상태**다.

Image Tag에 Commit SHA나 Build Number처럼 배포 버전을 식별할 수 있는 값을 사용하면 Source Code와 실제 배포된 Artifact도 연결할 수 있다.

```text
Git Commit
    ↓
Container Image
    ↓
Image Tag
    ↓
Deployment
```

이렇게 보면 Container Image는 단순한 패키징 결과물이 아니라 **실제 환경에 배포되는 버전을 식별하는 단위**가 된다.

---

## Jenkins는 어떻게 EKS의 상태를 변경할까?

Artifact가 준비되면 다음으로 Kubernetes가 새로운 Image를 사용하도록 만들어야 한다.

여기서 처음 가졌던 의문으로 돌아온다.

Jenkins가 EKS 외부에 있는데도 Deployment를 변경할 수 있는 이유는 Kubernetes가 **API를 통해 클러스터 상태를 관리하기 때문**이다.

`kubectl`과 `Helm` 역시 Kubernetes API를 사용하는 Client다.

```mermaid
flowchart LR
    subgraph EC2["Jenkins EC2"]
        J["Jenkins"] --> K["Helm / kubectl"]
    end

    K --> API["EKS API Endpoint<br/>Kubernetes API Server"]

    subgraph EKS["EKS Cluster"]
        API --> D["Deployment"]
    end
```

따라서 Jenkins와 EKS가 같은 서버에 있을 필요는 없다.

중요한 것은 Jenkins가 실행되는 환경에서 **EKS API Endpoint에 접근할 수 있고, Kubernetes 인증을 거쳐 Deployment를 변경할 권한이 있는지**다.

AWS 환경에서는 IAM을 이용한 인증과 Kubernetes 측의 권한 설정 등이 함께 관여할 수 있다.

결국 **Jenkins가 어디에 실행되고 있는가보다 Kubernetes API에 어떤 권한으로 접근할 수 있는가가 더 중요하다.**

처음 의문이었던 "EC2에 있는 Jenkins가 어떻게 EKS를 변경하지?"에 대한 답도 여기서 나온다.

---

## Jenkins가 변경하는 것은 Pod가 아니다

현재 Deployment가 다음 Image를 사용하고 있다고 해보자.

```text
Deployment
└── image: my-service:v1
```

새로운 Image를 ECR에 Push한 뒤 Jenkins는 `Helm`이나 `kubectl`을 이용해 Deployment가 새로운 Image를 사용하도록 변경한다.

```text
Before

image: my-service:v1


After

image: my-service:v2
```

여기서 중요한 점은 Jenkins가 새로운 Pod를 직접 생성하는 것이 아니라는 것이다.

Jenkins는 **Kubernetes가 유지해야 하는 상태를 변경한다.**

```text
기존 Desired State
→ my-service:v1

새로운 Desired State
→ my-service:v2
```

즉 Jenkins의 배포 작업은 "새 Pod를 만들어라"라는 직접적인 실행 명령보다는

**"이 Deployment는 이제 v2를 실행해야 한다"**

라는 상태를 Kubernetes에 전달하는 것에 가깝다.

---

## Kubernetes는 선언된 상태를 실제 상태로 만든다

Deployment는 이미 `v2`를 실행하도록 변경되었지만 현재 Pod들은 아직 `v1`을 실행하고 있을 수 있다.

```text
Desired State
→ my-service:v2

Actual State
→ my-service:v1
```

Kubernetes Controller는 선언된 상태와 현재 상태를 지속적으로 비교한다.

두 상태가 다르면 실제 상태를 선언된 상태에 맞추는 작업을 수행한다.

이 과정을 **Reconciliation**이라고 한다.

```mermaid
flowchart LR
    D["Deployment<br/>Desired State: v2"] --> C["Deployment Controller"]
    A["Actual State<br/>Pod: v1"] --> C

    C --> R["New ReplicaSet"]
    R --> P["New Pod: v2"]
    E["ECR<br/>my-service:v2"] -. "Image Pull" .-> P
```

Deployment의 Pod Template이 변경되면 새로운 ReplicaSet이 만들어지고, 그 ReplicaSet을 통해 새로운 Pod가 생성된다.

새로운 Pod는 자신의 Spec에 정의된 Image를 ECR에서 Pull하여 Container를 실행한다.

이 지점에서 Jenkins와 Kubernetes의 책임이 명확하게 나뉜다.

```text
Jenkins
→ 새로운 Desired State를 전달

Kubernetes
→ Actual State를 Desired State에 맞춤
```

처음에는 Jenkins가 Pod를 배포한다고 생각했지만 실제로는 **Jenkins가 상태 변경의 시작점을 만들고, Kubernetes가 그 상태를 실제 실행 환경으로 만들어낸다.**

---

## 그래서 Kubernetes 배포는 Pod를 "수정"하지 않는다

Desired State를 기준으로 배포 과정을 바라보면 Kubernetes의 배포 방식도 이해하기 쉬워진다.

전통적인 서버 배포에서는 기존 서버에 새로운 JAR이나 실행 파일을 올리고 프로세스를 재시작하는 방식을 사용할 수 있다.

```text
Server
   ↓
새로운 JAR 배포
   ↓
Process 재시작
```

Kubernetes의 Deployment는 기존 Pod 안에 새로운 Application을 덮어쓰는 방식이 아니다.

Pod Template이 변경되면 **새로운 버전의 Pod를 만들고 기존 Pod를 교체한다.**

Replica가 3개라고 하면 기존 상태는 다음과 같다.

```text
v1
v1
v1
```

RollingUpdate 과정에서는 점진적으로 새로운 Pod가 만들어질 수 있다.

```text
v1
v1
v2
```

```text
v1
v2
v2
```

최종적으로 새로운 상태에 도달한다.

```text
v2
v2
v2
```

즉 배포는 기존 실행 환경을 직접 수정하는 작업보다 **전체 실행 상태를 새로운 버전으로 수렴시키는 과정**에 가깝다.

앞에서 살펴본 Desired State와 Reconciliation이 실제 배포 방식으로 이어지는 지점이다.

---

## 배포 명령의 성공과 Rollout 완료는 다른 시점이다

이 구조를 이해하면 Jenkins Pipeline의 성공도 조금 다르게 볼 수 있다.

예를 들어 다음 명령이 정상적으로 실행되었다고 해보자.

```bash
helm upgrade ...
```

이는 Kubernetes에 Deployment 변경 요청이 정상적으로 전달되었다는 의미일 수 있다.

하지만 Kubernetes에서는 그 이후에도 실제 상태를 변경하는 작업이 이어진다.

```mermaid
flowchart LR
    D["Deployment 변경"] --> R["New ReplicaSet"]
    R --> P["New Pod"]
    P --> C["Container 실행"]
```

따라서 **배포 요청이 반영된 시점과 새로운 버전의 Rollout이 완료된 시점은 구분할 필요가 있다.**

필요하다면 Pipeline에서 다음과 같이 Rollout 완료까지 확인할 수 있다.

```bash
kubectl rollout status deployment/my-service
```

이것 역시 앞에서 나눈 책임과 연결된다.

Jenkins는 Desired State의 변경을 요청하고, Kubernetes는 실제 상태를 변경한다.

따라서 CI/CD Pipeline을 구성할 때는 **어디까지 확인했을 때 배포가 성공했다고 판단할 것인가**도 하나의 설계 요소가 된다.

---

## 전체 흐름 다시 보기

처음에는 배포 과정을 다음처럼 바라봤다.

```text
Jenkins
   ↓
EKS
   ↓
Pod
```

하지만 내부 흐름을 따라가 보면 실제로는 다음과 같이 역할이 나뉜다.

```mermaid
flowchart TD
    G["Git Repository"] --> J["Jenkins"]

    J --> B["Application Build"]
    B --> I["Container Image Build"]
    I --> E["ECR"]

    J --> H["Helm / kubectl"]
    H --> API["Kubernetes API"]
    API --> D["Deployment<br/>Desired State 변경"]

    D --> R["New ReplicaSet"]
    R --> P["New Pod"]
    E -. "Image Pull" .-> P
    P --> C["Container 실행"]
```

각 구성요소의 책임을 나누어 보면 전체 배포 과정이 더 명확해진다.

```text
Jenkins
→ CI/CD Pipeline 실행
→ Container Image 생성 및 Push
→ Deployment 상태 변경 요청

ECR
→ 실행할 Container Image 저장

Kubernetes API
→ 클러스터 상태 변경의 진입점

Deployment / Controller
→ Desired State 관리
→ Actual State를 Desired State에 맞춤

ReplicaSet
→ 필요한 수의 Pod 유지

Pod
→ 지정된 Image로 Application 실행
```

Jenkins 화면에서는 하나의 Pipeline으로 보이지만 내부에서는 **Artifact를 전달하는 흐름과 실행 상태를 변경하는 흐름이 분리되어 있다.**

그리고 Kubernetes는 전달받은 Desired State를 기준으로 실제 실행 환경을 계속 맞춘다.

---

## 정리

이 글을 정리하기 전에는 Jenkins에서 Pipeline을 실행하면 Jenkins가 애플리케이션을 EKS에 직접 배포한다고 막연하게 생각했다.

하지만 내부 흐름을 따라가 보니 배포는 두 가지 과정으로 나눠서 보는 편이 훨씬 명확했다.

먼저 실행할 Artifact가 만들어진다.

```mermaid
flowchart LR
    S["Source Code"] --> J["Jenkins"]
    J --> I["Container Image"]
    I --> E["ECR"]
```

그리고 Kubernetes가 어떤 Artifact를 실행해야 하는지가 변경된다.

```mermaid
flowchart LR
    J["Jenkins"] --> API["Kubernetes API"]
    API --> D["Deployment"]
    D --> S["Desired State 변경"]
```

그 이후 실제 실행 상태를 만드는 것은 Kubernetes다.

```mermaid
flowchart LR
    D["Desired State 변경"] --> R["Reconciliation"]
    R --> RS["ReplicaSet"]
    RS --> P["Pod"]
    P --> I["Image Pull"]
    I --> A["Application 실행"]
```

결국 Kubernetes 환경에서의 배포는 **애플리케이션 파일을 특정 서버로 전달하는 작업이라기보다, 실행할 Artifact를 준비하고 클러스터가 유지해야 할 상태를 새로운 버전으로 변경하는 과정**에 가깝다.

이 관점으로 바꾸고 나니 처음 가졌던 의문들도 자연스럽게 연결됐다.

Jenkins가 EKS 외부의 EC2에 있어도 Kubernetes API에 접근할 수 있다면 배포할 수 있다.

Container Image는 Jenkins에서 Pod로 직접 전달되지 않고 Registry를 통해 전달된다.

새로운 버전은 기존 Pod 안에 덮어쓰는 것이 아니라 새로운 Pod를 만들면서 반영된다.

그리고 Jenkins의 배포 명령이 성공하는 시점과 Kubernetes가 새로운 상태로 수렴하는 시점도 구분해서 볼 수 있다.

결국 처음에는 하나의 **"Jenkins 배포"**로 보였던 과정이 실제로는 서로 다른 시스템의 책임으로 나뉘어 있었다.

**Jenkins는 배포 과정을 자동화하고, ECR은 실행할 Artifact를 보관하며, Kubernetes는 선언된 상태를 실제 실행 상태로 만든다.**

Kubernetes 기반 CI/CD를 이해할 때 중요한 것은 각 도구의 사용법보다, **그 도구 사이에서 무엇이 전달되고 누가 실제 상태를 변경하는지 구분해서 보는 것**이라고 생각한다.
