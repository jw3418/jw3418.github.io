---
layout: default
title: Tech Blog
---

<div class="home-intro">
  <h1>Ewillwin's Tech Blog</h1>
  <p>백엔드 엔지니어링 관련 기록들.</p>
</div>

<p class="post-list-label">Posts</p>

<ul class="post-list">
  {% for post in site.posts %}
  <li>
    <span class="post-date">{{ post.date | date: "%Y.%m.%d" }}</span>
    <a href="{{ post.url | relative_url }}">{{ post.title }}</a>
  </li>
  {% endfor %}
</ul>
