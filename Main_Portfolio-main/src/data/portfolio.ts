// All portfolio content lives here — edit this file to update the site.

export interface LinkRef {
  label: string;
  url: string;
}

export interface Project {
  id: string;
  name: string;
  tagline: string;
  summary: string;
  highlights: string[];
  stats: { value: string; label: string }[];
  tech: string[];
  links: LinkRef[];
  accent: string;
}

export interface Achievement {
  place: string;
  event: string;
  year: string;
  detail: string;
  certificate?: string;
}

export const profile = {
  name: 'Hitesh A',
  firstName: 'Hitesh',
  role: 'AI & Data Science Engineer · Security-focused Builder',
  location: 'Udupi, Karnataka, India',
  intro:
    'I build software that holds up under pressure — tamper-proof documents, phishing defences, grounded AI assistants and data platforms that turn millions of records into answers.',
  email: 'hiteshacu@gmail.com',
  phone: '+91 6363428833',
  phoneHref: 'tel:+916363428833',
  linkedin: 'https://www.linkedin.com/in/hitesh-a-962106338/',
  github: 'https://github.com/Hiteshacu',
  resume: '/Hitesh_A_Resume.pdf',
};

export const education = {
  institute: 'Shri Madhwa Vadiraja Institute of Technology & Management',
  place: 'Bantakal, Udupi',
  degree: 'Bachelor of Engineering (B.E.) in Artificial Intelligence and Data Science',
  graduation: 'Expected 2027',
  scores: [
    { value: '8.33', label: 'CGPA' },
    { value: '80%', label: 'Class XII' },
    { value: '86%', label: 'Class X' },
  ],
};

export const skillGroups: { title: string; icon: string; items: string[] }[] = [
  { title: 'Languages', icon: '⌨', items: ['Java', 'Python', 'JavaScript', 'TypeScript', 'Go', 'Kotlin', 'SQL'] },
  { title: 'Backend & APIs', icon: '⚙', items: ['FastAPI', 'Spring Boot', 'Flask', 'REST APIs', 'JWT Authentication'] },
  { title: 'Frontend', icon: '◧', items: ['React', 'Next.js', 'Tailwind CSS'] },
  { title: 'Databases', icon: '⛁', items: ['MySQL', 'MongoDB', 'Schema design', 'Joins', 'Indexing'] },
  { title: 'Security', icon: '⛨', items: ['Cryptography (RSA-PSS, SHA-256)', 'Android Security', 'Network Security'] },
  { title: 'Testing', icon: '✓', items: ['Unit Testing', 'API Testing', 'Test Automation'] },
  {
    title: 'CS Fundamentals',
    icon: '∑',
    items: ['Data Structures & Algorithms', 'OOP', 'DBMS', 'Operating Systems', 'Computer Networks'],
  },
  { title: 'Tools & Infra', icon: '⚒', items: ['Git', 'Docker', 'Linux', 'Postman', 'Firebase'] },
];

export const projects: Project[] = [
  {
    id: 'payproof',
    name: 'PayProof',
    tagline: 'Document Integrity & Tamper Detection',
    summary:
      'Invisible cryptographic signatures embedded inside images, built to survive the real world — WhatsApp compression, JPEG re-encoding and screenshots — while pinpointing exactly where a document was edited.',
    highlights: [
      'Embedded RSA-PSS signatures in DCT blocks with LDPC coding; they survive WhatsApp, JPEG and screenshots',
      'Built a statistical tamper scan that draws boxes around edits: 107/120 located, 0/228 genuine copies falsely flagged',
      'Fraud benchmark: 76/76 forgeries caught, 0/40 genuine documents accused',
      '36 automated tests, shipped as both a web app and an Android app',
    ],
    stats: [
      { value: '76/76', label: 'forgeries caught' },
      { value: '0/228', label: 'false flags' },
      { value: '36', label: 'automated tests' },
    ],
    tech: ['Python', 'NumPy', 'OpenCV', 'FastAPI', 'React', 'TypeScript', 'Kotlin'],
    links: [
      { label: 'GitHub', url: 'https://github.com/Hiteshacu/PayProof' },
      { label: 'Demo (Drive)', url: 'https://drive.google.com/file/d/1NTU_JiWeYXvcWT3G8lJUW4uS3jRaZPob/view?usp=drive_link' },
    ],
    accent: '#f2b35c',
  },
  {
    id: 'phishguard',
    name: 'PhishGuardAI',
    tagline: 'Android Messaging Security Layer',
    summary:
      'A real-time shield for messaging apps that catches phishing links and OTP-harvesting attempts before a user taps them. Won 2nd place at the Kaspersky Cybersecurity Hackathon.',
    highlights: [
      'Scans WhatsApp and Telegram messages in real time for phishing links and OTP-harvesting attempts',
      'Resolves suspicious redirects inside a sandboxed browser before the user ever opens them',
      '96% precision on a labelled test set',
    ],
    stats: [
      { value: '96%', label: 'precision' },
      { value: '2nd', label: 'Kaspersky Hackathon' },
      { value: 'Live', label: 'message scanning' },
    ],
    tech: ['Java', 'Android NotificationListener', 'Python', 'Threat-intel APIs', 'REST APIs'],
    links: [{ label: 'GitHub', url: 'https://github.com/Hiteshacu/PhishingGuard_AI' }],
    accent: '#7fd6c2',
  },
  {
    id: 'aadhaar',
    name: 'Aadhaar Trends Analyzer',
    tagline: 'Large-scale Data Analytics Platform',
    summary:
      'A high-performance analytics platform over ~5 million Aadhaar enrolment records, with an LLM layer that turns plain-English questions into validated SQL.',
    highlights: [
      'Built a Go-based REST API service for high-performance analysis of ~5M Aadhaar enrolment records',
      'State-wise choropleths and automated trend detection',
      'Structured Gemini prompts convert plain-English questions into validated SQL, with schema grounding to prevent hallucinated queries',
      'Excel/CSV reporting for downstream teams',
    ],
    stats: [
      { value: '~5M', label: 'records analysed' },
      { value: 'NL→SQL', label: 'schema-grounded' },
      { value: 'Go', label: 'REST service' },
    ],
    tech: ['Go', 'Python', 'Flask', 'Pandas', 'Plotly', 'MySQL', 'Gemini'],
    links: [{ label: 'GitHub', url: 'https://github.com/Hiteshacu/Udhai_Hackathon' }],
    accent: '#9fb8ff',
  },
  {
    id: 'nordicguard',
    name: 'NordicGuard',
    tagline: 'AI-powered GDPR Compliance Platform',
    summary:
      'A retrieval-augmented compliance assistant that answers with article- and recital-level GDPR citations instead of ungrounded guesses, plus a PII redaction engine.',
    highlights: [
      'Retrieval-augmented LLM assistant grounded on the GDPR corpus',
      'Returns article- and recital-level citations instead of ungrounded answers',
      'Engineered a 13-category PII detection and redaction engine',
    ],
    stats: [
      { value: '13', label: 'PII categories' },
      { value: 'RAG', label: 'cited answers' },
      { value: 'GDPR', label: 'full corpus' },
    ],
    tech: ['React', 'TypeScript', 'Vercel AI SDK', 'Gemma'],
    links: [{ label: 'GitHub', url: 'https://github.com/Hiteshacu/Advance_breakdown' }],
    accent: '#e39bd0',
  },
];

export const achievementsIntro = 'Top finishes in 10+ national and state-level hackathons (2024–2026).';

export const achievements: Achievement[] = [
  {
    place: '2nd',
    event: 'Kaspersky Cybersecurity Hackathon',
    year: 'MIT Bengaluru · 2025',
    detail: 'PhishGuardAI — real-time phishing defence for messaging apps',
    certificate: 'https://drive.google.com/file/d/14fb6LDr1vo2NisAwhl76uv2lJHDCmxwo/view?usp=sharing',
  },
  {
    place: '2nd',
    event: 'Edge-Sponsored Hackathon — AI & Security Track',
    year: '2025',
    detail: 'Anonymised email-alias agent that masks personal inboxes',
    certificate: 'https://drive.google.com/file/d/1nU75pdEkJqL7ivd5Y74-budbenW5vJTX/view?usp=sharing',
  },
  {
    place: '2nd',
    event: 'IBM Medical Emergency Challenge',
    year: '2024',
    detail: 'Multilingual voice-based ambulance dispatch with route optimisation',
    certificate: 'https://drive.google.com/file/d/1dKomkTsYwxGc67c7irRJlAGf7phDKV1v/view?usp=drive_link',
  },
  {
    place: '3rd',
    event: 'CyberShield 2026',
    year: '2026',
    detail: 'Digital Trust Shield',
    certificate: 'https://drive.google.com/file/d/1396pGRlSPKohiBTp3WtQyH6nPZv7y3Kj/view?usp=drive_link',
  },
  {
    place: '3rd',
    event: 'HackMitten 2.0',
    year: 'MIT Thandavapura · 2025',
    detail: 'Browser extension for source-code vulnerability scanning',
    certificate: 'https://drive.google.com/file/d/1CZBW5k1Htg07dv6TfR0ButHHkU7uxXGc/view?usp=sharing',
  },
  {
    place: 'Ranked',
    event: 'Anveshana',
    year: '2024–2026',
    detail: 'Multiple national and state-level rankings',
    certificate: 'https://drive.google.com/drive/folders/13pIyv6IAznwmvXazKaBtwcHOQU4nAxPa?usp=drive_link',
  },
];

export const certifications = [
  { issuer: 'Kaspersky Academy', title: 'Cybersecurity Architecture & Defensive Strategy' },
  { issuer: 'Cisco Networking Academy', title: 'Network Security Protocols' },
  { issuer: 'Google Developers', title: 'Android Development (Java/Kotlin) & Firebase' },
];
