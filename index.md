---
layout: default
title: Tech Blog
---

<div class="home-intro">
  <h1>Ewillwin's Tech Blog</h1>
  <p>백엔드 엔지니어링 관련 기록들.</p>
</div>

<div class="category-bar">
  <button class="cat-btn active" data-cat="all">전체</button>
  {% assign cats = site.posts | map: "categories" | flatten | uniq | sort %}
  {% for cat in cats %}
  <button class="cat-btn" data-cat="{{ cat }}">{{ site.data.categories[cat] | default: cat }}</button>
  {% endfor %}
</div>

<p class="post-list-label">Posts</p>

<ul class="post-list" id="post-list">
  {% for post in site.posts %}
  <li data-categories="{{ post.categories | join: ' ' }}">
    <span class="post-date">{{ post.date | date: "%Y.%m.%d" }}</span>
    <a href="{{ post.url | relative_url }}">{{ post.title }}</a>
  </li>
  {% endfor %}
</ul>
<p class="post-list-empty" id="post-list-empty" style="display:none">해당 카테고리의 포스트가 없습니다.</p>
