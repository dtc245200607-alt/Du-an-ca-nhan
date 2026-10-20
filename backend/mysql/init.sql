CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(120) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('admin', 'editor', 'viewer') NOT NULL DEFAULT 'viewer',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS projects (
  id VARCHAR(64) PRIMARY KEY,
  title VARCHAR(100) NOT NULL,
  category VARCHAR(60) NOT NULL,
  project_year CHAR(4) NOT NULL,
  description VARCHAR(500) NOT NULL,
  stack JSON NOT NULL,
  color VARCHAR(20) NOT NULL DEFAULT 'lavender',
  featured BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_projects_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS messages (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(80) NOT NULL,
  email VARCHAR(120) NOT NULL,
  message VARCHAR(1000) NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_messages_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS portfolio_content (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
