# 이미지 준비 가이드

이 폴더에 다음 이미지들을 추가해주세요:

## 1. 파비콘 (탭 아이콘)
- `favicon-16x16.png` - 16x16 픽셀
- `favicon-32x32.png` - 32x32 픽셀  
- `apple-touch-icon.png` - 180x180 픽셀 (iOS 홈화면 아이콘)

## 2. Open Graph 이미지 (링크 공유 썸네일)
- `og-image.png` - 1200x630 픽셀 권장

## 이미지 생성 방법

### 온라인 툴 사용:
1. **Favicon Generator**: https://favicon.io/
   - 텍스트나 이미지로 파비콘 생성 가능
   - 필요한 모든 사이즈 자동 생성

2. **Canva**: https://www.canva.com/
   - og-image.png 생성 (1200x630)
   - 블로그 이름과 설명을 멋지게 디자인

### 추천 디자인:
- **파비콘**: 'E' 또는 'EW' 이니셜, 간단한 로고
- **OG 이미지**: 
  - 배경: #437299 (블로그 테마 색상)
  - 텍스트: "Ewillwin's Tech Blog"
  - 서브텍스트: "백엔드 엔지니어링 관련 기록들"
  - 흰색 텍스트, 깔끔한 폰트

## 빠른 시작 (임시 이미지)

당장 테스트하려면 간단한 색상 이미지로 시작할 수 있습니다:
```bash
# ImageMagick이 설치되어 있다면
convert -size 32x32 xc:#437299 favicon-32x32.png
convert -size 16x16 xc:#437299 favicon-16x16.png
convert -size 180x180 xc:#437299 apple-touch-icon.png
convert -size 1200x630 xc:#437299 -pointsize 72 -fill white -gravity center -annotate +0+0 "Ewillwin's\nTech Blog" og-image.png
```

또는 무료 이미지 생성 사이트:
- https://www.favicon-generator.org/
- https://realfavicongenerator.net/
