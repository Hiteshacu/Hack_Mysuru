import {
  achievements,
  achievementsIntro,
  certifications,
  education,
  profile,
  projects,
  skillGroups,
  type Project,
} from '../data/portfolio';
import { icons } from './icons';

const ext = (url: string, label: string, cls = 'btn btn-ghost') =>
  `<a class="${cls}" href="${url}" target="_blank" rel="noopener noreferrer">${label}${icons.external}</a>`;

export function contactButtons(compact = false) {
  return `
  <div class="contact-grid ${compact ? 'compact' : ''}">
    <a class="contact-card" href="mailto:${profile.email}" data-copy="${profile.email}">
      <span class="contact-icon">${icons.mail}</span>
      <span><small>Email</small><strong>${profile.email}</strong></span>
    </a>
    <a class="contact-card" href="${profile.phoneHref}" data-copy="${profile.phone}">
      <span class="contact-icon">${icons.phone}</span>
      <span><small>Phone</small><strong>${profile.phone}</strong></span>
    </a>
    <a class="contact-card" href="${profile.linkedin}" target="_blank" rel="noopener noreferrer">
      <span class="contact-icon">${icons.linkedin}</span>
      <span><small>LinkedIn</small><strong>hitesh-a</strong></span>
    </a>
    <a class="contact-card" href="${profile.github}" target="_blank" rel="noopener noreferrer">
      <span class="contact-icon">${icons.code}</span>
      <span><small>GitHub</small><strong>@Hiteshacu</strong></span>
    </a>
  </div>`;
}

export function welcomeHTML() {
  return `
    <p class="lead">Hi, I'm <strong>${profile.name}</strong> — ${profile.intro}</p>
    <div class="stat-row">
      <div class="stat"><b>10+</b><span>hackathon podiums</span></div>
      <div class="stat"><b>4</b><span>flagship projects</span></div>
      <div class="stat"><b>8.33</b><span>CGPA · B.E. AI &amp; DS</span></div>
    </div>
    <h4 class="eyebrow">How to explore</h4>
    <ul class="how">
      <li><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> or arrows to walk · <kbd>Shift</kbd> to sprint · <kbd>Space</kbd> to jump</li>
      <li>Drag to look around · scroll to zoom · click the ground to walk there</li>
      <li>Stand in a glowing ring and press <kbd>E</kbd> to open a station</li>
      <li>Use the top bar or map (<kbd>M</kbd>) to travel instantly</li>
    </ul>
    <div class="actions">
      <a class="btn btn-primary" href="${profile.resume}" target="_blank" rel="noopener">${icons.download} Résumé</a>
      ${ext(profile.github, 'GitHub')}
      ${ext(profile.linkedin, 'LinkedIn')}
    </div>`;
}

export function aboutHTML() {
  return `
    <p class="lead">${profile.intro}</p>
    <p>I'm an engineering student in <strong>Artificial Intelligence &amp; Data Science</strong> from ${profile.location}, working at the intersection of <strong>security, backend systems and applied AI</strong>. I like measurable results: forgeries caught, false positives avoided, queries grounded in real schemas.</p>
    <div class="edu-card">
      <div class="edu-icon">${icons.cap}</div>
      <div>
        <small class="eyebrow">Education</small>
        <h3>${education.institute}</h3>
        <p>${education.degree}</p>
        <p class="muted">${education.place} · ${education.graduation}</p>
      </div>
    </div>
    <div class="stat-row">
      ${education.scores.map((s) => `<div class="stat"><b>${s.value}</b><span>${s.label}</span></div>`).join('')}
    </div>
    <h4 class="eyebrow">What I focus on</h4>
    <div class="chips">
      ${['Cryptography & document integrity', 'Android & messaging security', 'Grounded LLM / RAG systems', 'High-performance APIs', 'Large-scale data analytics'].map((c) => `<span class="chip">${c}</span>`).join('')}
    </div>`;
}

export function skillsHTML() {
  return `
    <div class="skill-grid">
      ${skillGroups
        .map(
          (g) => `
        <section class="skill-card">
          <header><span class="skill-icon">${g.icon}</span><h3>${g.title}</h3></header>
          <div class="chips">${g.items.map((i) => `<span class="chip">${i}</span>`).join('')}</div>
        </section>`,
        )
        .join('')}
    </div>`;
}

export function projectCardHTML(p: Project, index: number, detailed = false) {
  return `
    <article class="project-card" style="--accent:${p.accent}" data-project="${p.id}">
      <header>
        <span class="project-index">0${index + 1}</span>
        <div>
          <h3>${p.name}</h3>
          <p class="tagline">${p.tagline}</p>
        </div>
      </header>
      <p>${p.summary}</p>
      <div class="stat-row small">
        ${p.stats.map((s) => `<div class="stat"><b>${s.value}</b><span>${s.label}</span></div>`).join('')}
      </div>
      ${detailed ? `<ul class="bullets">${p.highlights.map((h) => `<li>${h}</li>`).join('')}</ul>` : ''}
      <div class="chips">${p.tech.map((t) => `<span class="chip">${t}</span>`).join('')}</div>
      <div class="actions">${p.links.map((l) => ext(l.url, l.label)).join('')}</div>
    </article>`;
}

export function projectsHTML() {
  return `
    <p class="lead">Four builds I'm proud of — each one solves a real trust or data problem, with numbers to back it up.</p>
    <div class="project-list">${projects.map((p, i) => projectCardHTML(p, i)).join('')}</div>`;
}

export function projectDetailHTML(id: string) {
  const i = projects.findIndex((p) => p.id === id);
  const p = projects[i];
  const prev = projects[(i + projects.length - 1) % projects.length];
  const next = projects[(i + 1) % projects.length];
  return `
    ${projectCardHTML(p, i, true)}
    <nav class="project-nav">
      <button class="btn btn-ghost" data-open-project="${prev.id}">${icons.arrowLeft} ${prev.name}</button>
      <button class="btn btn-ghost" data-open-project="${next.id}">${next.name} ${icons.arrowRight}</button>
    </nav>`;
}

export function achievementsHTML() {
  return `
    <p class="lead">${achievementsIntro}</p>
    <ol class="timeline">
      ${achievements
        .map(
          (a) => `
        <li class="timeline-item place-${a.place.toLowerCase()}">
          <span class="medal">${a.place}</span>
          <div>
            <h3>${a.event}</h3>
            <p class="muted">${a.year}</p>
            <p>${a.detail}</p>
            ${a.certificate ? ext(a.certificate, 'Certificate', 'link') : ''}
          </div>
        </li>`,
        )
        .join('')}
    </ol>`;
}

export function certificationsHTML() {
  return `
    <div class="cert-list">
      ${certifications
        .map(
          (c) => `
        <div class="cert-card">
          <span class="cert-seal">${icons.sparkle}</span>
          <div><small class="eyebrow">${c.issuer}</small><h3>${c.title}</h3></div>
        </div>`,
        )
        .join('')}
    </div>`;
}

export function contactHTML() {
  return `
    <p class="lead">Want to collaborate, hire me, or team up for the next hackathon? Reach out on any of these.</p>
    ${contactButtons()}
    <div class="actions">
      <a class="btn btn-primary" href="mailto:${profile.email}?subject=Hello%20Hitesh">${icons.mail} Say hello</a>
      <a class="btn btn-ghost" href="${profile.resume}" target="_blank" rel="noopener">${icons.download} Résumé</a>
    </div>
    <p class="muted small-print">${icons.pin} ${profile.location}</p>`;
}

export const sectionMeta: Record<string, { eyebrow: string; title: string; render: () => string }> = {
  welcome: { eyebrow: 'The Gate', title: `Welcome to my world`, render: welcomeHTML },
  about: { eyebrow: 'The Cabin', title: 'About & Education', render: aboutHTML },
  skills: { eyebrow: 'Crystal Circle', title: 'Skills & Toolkit', render: skillsHTML },
  projects: { eyebrow: 'Project Grove', title: 'Projects', render: projectsHTML },
  achievements: { eyebrow: 'Hall of Trophies', title: 'Hackathons & Achievements', render: achievementsHTML },
  certifications: { eyebrow: 'Banner Ridge', title: 'Certifications', render: certificationsHTML },
  contact: { eyebrow: 'Lakeside Camp', title: "Let's talk", render: contactHTML },
};
