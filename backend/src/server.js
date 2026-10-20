import express from 'express';
import client from 'prom-client';
import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

const app = express();
const port = Number(process.env.PORT || 3000);
const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  database: process.env.DB_NAME || 'portfolio',
  user: process.env.DB_USER || 'portfolio_app',
  password: process.env.DB_PASSWORD || 'portfolio_dev_password',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4',
});
app.disable('x-powered-by');
app.use(express.json({ limit: '32kb' }));

const registry = new client.Registry();
client.collectDefaultMetrics({ register: registry });
const requests = new client.Counter({ name: 'http_requests_total', help: 'Total HTTP requests', labelNames: ['method', 'route', 'status'] });
registry.registerMetric(requests);
app.use((req, res, next) => {
  const started = Date.now();
  res.on('finish', () => {
    requests.inc({ method: req.method, route: req.route?.path || req.path, status: String(res.statusCode) });
    console.log(JSON.stringify({ level: 'info', msg: 'http_request', method: req.method, path: req.path, status: res.statusCode, duration_ms: Date.now() - started }));
  });
  next();
});

const demoUsers = [
  { id: 'u-admin', name: 'Sùng A Dà', email: 'admin@demo.vn', password: '123456@', role: 'admin' },
  { id: 'u-editor', name: 'Quang Huy', email: 'editor@demo.vn', password: '123456@', role: 'editor' },
  { id: 'u-viewer', name: 'Linh Chi', email: 'viewer@demo.vn', password: '123456@', role: 'viewer' },
];
const demoProjects = [
  { id: 'p-01', title: 'Nền tảng Portfolio', category: 'Web development', year: '2026', description: 'Website cá nhân hiện đại, responsive, có trang quản trị và API kết nối MySQL.', stack: ['React', 'Node.js', 'Docker'], color: 'lavender', featured: true },
  { id: 'p-02', title: 'Bảng điều khiển vận hành', category: 'Product design', year: '2025', description: 'Trải nghiệm quản lý số liệu và theo dõi tình trạng dịch vụ trong một giao diện gọn gàng.', stack: ['React', 'UX/UI', 'Charts'], color: 'peach', featured: true },
  { id: 'p-03', title: 'Ứng dụng khám phá cà phê', category: 'Mobile experience', year: '2025', description: 'Đề xuất quán cà phê theo sở thích, khu vực và đánh giá cộng đồng.', stack: ['Figma', 'Research', 'Prototype'], color: 'mint', featured: true },
  { id: 'p-04', title: 'Thư viện thành phần UI', category: 'Design systems', year: '2024', description: 'Bộ component có khả năng tái sử dụng, trạng thái rõ ràng và hỗ trợ nhiều kích thước màn hình.', stack: ['Design system', 'CSS', 'Accessibility'], color: 'blue', featured: false },
];
const tokens = new Map();
const recentErrors = [];
const recordError = (entry) => {
  recentErrors.unshift({ ...entry, time: new Date().toISOString() });
  if (recentErrors.length > 30) recentErrors.length = 30;
};
const text = (value, max = 180) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const publicUser = ({ password_hash, ...user }) => user;
const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
const parseStack = (value) => Array.isArray(value) ? value : JSON.parse(value || '[]');
const projectFromRow = (row) => ({ ...row, stack: parseStack(row.stack), featured: Boolean(row.featured) });

async function waitForDatabase() {
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    try {
      await pool.query('SELECT 1');
      console.log(JSON.stringify({ level: 'info', msg: 'database_connected', database: process.env.DB_NAME || 'portfolio' }));
      return;
    } catch (error) {
      if (attempt === 30) throw error;
      console.log(JSON.stringify({ level: 'info', msg: 'waiting_for_database', attempt }));
      await delay(2000);
    }
  }
}

async function seedDatabase() {
  await pool.query(`CREATE TABLE IF NOT EXISTS portfolio_content (
    id TINYINT UNSIGNED PRIMARY KEY,
    profile_name VARCHAR(100) NOT NULL DEFAULT 'Sùng A Dà',
    avatar_url VARCHAR(500) NOT NULL DEFAULT '/images/sung-a-da.png',
    education_school VARCHAR(180) NOT NULL DEFAULT 'Trường Đại học Công nghệ Thông tin và Truyền thông Thái Nguyên',
    education_major VARCHAR(120) NOT NULL DEFAULT 'Công nghệ thông tin',
    education_period VARCHAR(80) NOT NULL DEFAULT 'Sinh viên năm 3',
    contact_email VARCHAR(160) NOT NULL DEFAULT 'sungda481@gmail.com',
    github_url VARCHAR(300) NOT NULL DEFAULT 'https://github.com/dtc245200607-alt/Du-an-ca-nhan',
    social_links JSON NOT NULL,
    about_title VARCHAR(180) NOT NULL,
    about_text TEXT NOT NULL,
    skills JSON NOT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  const migrations = [
    ['profile_name', "VARCHAR(100) NOT NULL DEFAULT 'Sùng A Dà'"],
    ['avatar_url', "VARCHAR(500) NOT NULL DEFAULT '/images/sung-a-da.png'"],
    ['education_school', "VARCHAR(180) NOT NULL DEFAULT 'Trường Đại học Công nghệ Thông tin và Truyền thông Thái Nguyên'"],
    ['education_major', "VARCHAR(120) NOT NULL DEFAULT 'Công nghệ thông tin'"],
    ['education_period', "VARCHAR(80) NOT NULL DEFAULT 'Sinh viên năm 3'"],
    ['contact_email', "VARCHAR(160) NOT NULL DEFAULT 'sungda481@gmail.com'"],
    ['github_url', "VARCHAR(300) NOT NULL DEFAULT 'https://github.com/dtc245200607-alt/Du-an-ca-nhan'"],
    ['social_links', 'JSON NULL'],
  ];
  for (const [column, definition] of migrations) {
    const [[{ count }]] = await pool.execute('SELECT COUNT(*) AS count FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?', ['portfolio_content', column]);
    if (Number(count) === 0) await pool.query(`ALTER TABLE portfolio_content ADD COLUMN ${column} ${definition}`);
  }
  const [[userCount]] = await pool.query('SELECT COUNT(*) AS count FROM users');
  if (Number(userCount.count) === 0) {
    for (const user of demoUsers) {
      const passwordHash = await bcrypt.hash(user.password, 10);
      await pool.execute('INSERT INTO users (id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?)', [user.id, user.name, user.email, passwordHash, user.role]);
    }
  }
  const [[projectCount]] = await pool.query('SELECT COUNT(*) AS count FROM projects');
  if (Number(projectCount.count) === 0) {
    for (const project of demoProjects) {
      await pool.execute('INSERT INTO projects (id, title, category, project_year, description, stack, color, featured) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [project.id, project.title, project.category, project.year, project.description, JSON.stringify(project.stack), project.color, project.featured]);
    }
  }
  const [[contentCount]] = await pool.query('SELECT COUNT(*) AS count FROM portfolio_content');
  if (Number(contentCount.count) === 0) {
    const skills = [
      { title: 'Giao diện portfolio', details: 'React · JavaScript · CSS' },
      { title: 'Backend & dữ liệu', details: 'Node.js · Express · MySQL' },
      { title: 'Chạy dự án', details: 'Docker · Nginx · API' },
    ];
    await pool.execute('INSERT INTO portfolio_content (id, about_title, about_text, skills, social_links) VALUES (1, ?, ?, ?, ?)', [
      'Mình đang học cách biến ý tưởng thành sản phẩm thực tế.',
      'Mình là Sùng A Dà, sinh viên năm 3 ngành Công nghệ thông tin tại Trường Đại học Công nghệ Thông tin và Truyền thông Thái Nguyên. Mình tự xây dựng website portfolio này để giới thiệu bản thân và các dự án đã thực hiện. Qua dự án, mình thực hành kết nối giao diện React, API Node.js và cơ sở dữ liệu MySQL.',
      JSON.stringify(skills),
      JSON.stringify([]),
    ]);
  }
}

const authenticate = asyncRoute(async (req, res, next) => {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  const userId = token && tokens.get(token);
  if (!userId) return res.status(401).json({ error: 'Vui lòng đăng nhập để tiếp tục.' });
  const [rows] = await pool.execute('SELECT id, name, email, role FROM users WHERE id = ? LIMIT 1', [userId]);
  if (!rows.length) return res.status(401).json({ error: 'Vui lòng đăng nhập để tiếp tục.' });
  req.user = rows[0];
  req.token = token;
  next();
});
function allow(...roles) {
  return (req, res, next) => roles.includes(req.user.role)
    ? next()
    : res.status(403).json({ error: 'Tài khoản của bạn không có quyền thực hiện thao tác này.' });
}

app.get('/api/health', asyncRoute(async (_req, res) => {
  await pool.query('SELECT 1');
  res.json({ status: 'ok', mode: 'mysql', database: 'connected', uptime: Math.round(process.uptime()) });
}));
app.get('/api/content', asyncRoute(async (_req, res) => {
  const [[row]] = await pool.query('SELECT profile_name AS profileName, avatar_url AS avatarUrl, education_school AS educationSchool, education_major AS educationMajor, education_period AS educationPeriod, contact_email AS contactEmail, github_url AS githubUrl, social_links AS socialLinks, about_title AS aboutTitle, about_text AS aboutText, skills FROM portfolio_content WHERE id = 1');
  res.json({ ...row, socialLinks: parseStack(row.socialLinks), skills: parseStack(row.skills) });
}));
app.put('/api/admin/content', authenticate, allow('admin'), asyncRoute(async (req, res) => {
  const profileName = text(req.body?.profileName, 100);
  const avatarUrl = text(req.body?.avatarUrl, 500);
  const educationSchool = text(req.body?.educationSchool, 180);
  const educationMajor = text(req.body?.educationMajor, 120);
  const educationPeriod = text(req.body?.educationPeriod, 80);
  const contactEmail = text(req.body?.contactEmail, 160);
  const githubUrl = text(req.body?.githubUrl, 300);
  const aboutTitle = text(req.body?.aboutTitle, 180);
  const aboutText = typeof req.body?.aboutText === 'string' ? req.body.aboutText.trim().slice(0, 2000) : '';
  const skills = Array.isArray(req.body?.skills) ? req.body.skills.slice(0, 12).map((skill) => ({ title: text(skill?.title, 100), details: text(skill?.details, 180) })).filter((skill) => skill.title && skill.details) : [];
  const socialLinks = Array.isArray(req.body?.socialLinks) ? req.body.socialLinks.slice(0, 8).map((link) => ({ label: text(link?.label, 40), url: text(link?.url, 300) })).filter((link) => link.label && /^https?:\/\//i.test(link.url)) : [];
  if (!profileName || !avatarUrl || (!avatarUrl.startsWith('/') && !/^https:\/\//i.test(avatarUrl)) || !educationSchool || !educationMajor || !educationPeriod || !contactEmail.includes('@') || !/^https:\/\//i.test(githubUrl) || !aboutTitle || !aboutText || !skills.length) return res.status(400).json({ error: 'Vui lòng kiểm tra hồ sơ, ảnh đại diện, học vấn, liên hệ, phần giới thiệu và ít nhất một kỹ năng.' });
  await pool.execute('UPDATE portfolio_content SET profile_name = ?, avatar_url = ?, education_school = ?, education_major = ?, education_period = ?, contact_email = ?, github_url = ?, social_links = ?, about_title = ?, about_text = ?, skills = ? WHERE id = 1', [profileName, avatarUrl, educationSchool, educationMajor, educationPeriod, contactEmail, githubUrl, JSON.stringify(socialLinks), aboutTitle, aboutText, JSON.stringify(skills)]);
  res.json({ profileName, avatarUrl, educationSchool, educationMajor, educationPeriod, contactEmail, githubUrl, socialLinks, aboutTitle, aboutText, skills });
}));
app.get('/api/projects', asyncRoute(async (_req, res) => {
  const [rows] = await pool.query('SELECT id, title, category, project_year AS year, description, stack, color, featured FROM projects ORDER BY created_at DESC, id');
  res.json(rows.map(projectFromRow));
}));
app.post('/api/auth/login', asyncRoute(async (req, res) => {
  const email = text(req.body?.email, 120).toLowerCase();
  const password = text(req.body?.password, 120);
  const [rows] = await pool.execute('SELECT id, name, email, password_hash, role FROM users WHERE email = ? LIMIT 1', [email]);
  const user = rows[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash))) return res.status(401).json({ error: 'Email hoặc mật khẩu chưa chính xác.' });
  const token = randomUUID();
  tokens.set(token, user.id);
  res.json({ token, user: publicUser(user) });
}));
app.get('/api/auth/me', authenticate, (req, res) => res.json({ user: publicUser(req.user) }));
app.post('/api/auth/logout', authenticate, (req, res) => {
  tokens.delete(req.token);
  res.json({ success: true });
});
app.post('/api/projects', authenticate, allow('admin', 'editor'), asyncRoute(async (req, res) => {
  const title = text(req.body?.title, 100);
  const description = text(req.body?.description, 500);
  if (!title || !description) return res.status(400).json({ error: 'Tên và mô tả dự án là bắt buộc.' });
  const [countRows] = await pool.query('SELECT COUNT(*) AS count FROM projects');
  const project = {
    id: `p-${randomUUID()}`, title, description,
    category: text(req.body?.category, 60) || 'Dự án mới', year: text(req.body?.year, 4) || '2026',
    stack: Array.isArray(req.body?.stack) ? req.body.stack.map((item) => text(item, 24)).filter(Boolean).slice(0, 6) : [],
    color: ['lavender', 'peach', 'mint', 'blue'][Number(countRows[0].count) % 4], featured: Boolean(req.body?.featured),
  };
  await pool.execute('INSERT INTO projects (id, title, category, project_year, description, stack, color, featured) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [project.id, project.title, project.category, project.year, project.description, JSON.stringify(project.stack), project.color, project.featured]);
  res.status(201).json(project);
}));
app.put('/api/projects/:id', authenticate, allow('admin', 'editor'), asyncRoute(async (req, res) => {
  const [rows] = await pool.execute('SELECT id, title, category, project_year AS year, description, stack, color, featured FROM projects WHERE id = ? LIMIT 1', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Không tìm thấy dự án.' });
  const current = projectFromRow(rows[0]);
  const title = text(req.body?.title, 100);
  const description = text(req.body?.description, 500);
  if (!title || !description) return res.status(400).json({ error: 'Tên và mô tả dự án là bắt buộc.' });
  const project = {
    ...current, title, description,
    category: text(req.body?.category, 60) || current.category,
    year: text(req.body?.year, 4) || current.year,
    stack: Array.isArray(req.body?.stack) ? req.body.stack.map((item) => text(item, 24)).filter(Boolean).slice(0, 6) : current.stack,
    featured: typeof req.body?.featured === 'boolean' ? req.body.featured : current.featured,
  };
  await pool.execute('UPDATE projects SET title = ?, category = ?, project_year = ?, description = ?, stack = ?, featured = ? WHERE id = ?', [project.title, project.category, project.year, project.description, JSON.stringify(project.stack), project.featured, project.id]);
  res.json(project);
}));
app.delete('/api/projects/:id', authenticate, allow('admin'), asyncRoute(async (req, res) => {
  const [result] = await pool.execute('DELETE FROM projects WHERE id = ?', [req.params.id]);
  if (result.affectedRows === 0) return res.status(404).json({ error: 'Không tìm thấy dự án.' });
  res.json({ success: true });
}));
app.post('/api/contact', asyncRoute(async (req, res) => {
  const name = text(req.body?.name, 80);
  const email = text(req.body?.email, 120);
  const message = text(req.body?.message, 1000);
  if (!name || !email.includes('@') || message.length < 10) return res.status(400).json({ error: 'Vui lòng kiểm tra tên, email và nội dung (tối thiểu 10 ký tự).' });
  const id = `m-${randomUUID()}`;
  await pool.execute('INSERT INTO messages (id, name, email, message) VALUES (?, ?, ?, ?)', [id, name, email, message]);
  res.status(201).json({ success: true, message: 'Cảm ơn bạn! Tin nhắn đã được lưu vào cơ sở dữ liệu.' });
}));
app.get('/api/messages', authenticate, allow('admin'), asyncRoute(async (_req, res) => {
  const [rows] = await pool.query('SELECT id, name, email, message, created_at AS createdAt, is_read AS `read` FROM messages ORDER BY created_at DESC');
  res.json(rows.map((row) => ({ ...row, createdAt: new Date(row.createdAt).toISOString(), read: Boolean(row.read) })));
}));
app.get('/api/admin/status', authenticate, allow('admin'), asyncRoute(async (_req, res) => {
  const [[projectCount]] = await pool.query('SELECT COUNT(*) AS count FROM projects');
  const [[messageCount]] = await pool.query('SELECT COUNT(*) AS count FROM messages');
  res.json({ api: 'ok', database: 'connected', uptime: Math.round(process.uptime()), projects: Number(projectCount.count), messages: Number(messageCount.count), errors: recentErrors });
}));
app.get('/metrics', async (_req, res) => { res.set('Content-Type', registry.contentType); res.end(await registry.metrics()); });
app.use('/api', (_req, res) => res.status(404).json({ error: 'Không tìm thấy API.' }));
app.use((error, _req, res, _next) => {
  recordError({ message: String(error.message || 'Unknown error').slice(0, 300), type: error.name || 'Error' });
  console.error(JSON.stringify({ level: 'error', msg: 'request_failed', error: error.message }));
  if (!res.headersSent) res.status(500).json({ error: 'Lỗi máy chủ. Vui lòng thử lại.' });
});

await waitForDatabase();
await seedDatabase();
app.listen(port, '0.0.0.0', () => console.log(JSON.stringify({ level: 'info', msg: 'server_started', port, mode: 'mysql', database: 'connected' })));
