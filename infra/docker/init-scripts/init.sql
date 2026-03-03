-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";
CREATE EXTENSION IF NOT EXISTS "postgis";

-- Create test database
SELECT 'CREATE DATABASE marketplace_test'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'marketplace_test')\gexec

-- Enable extensions on test database
\c marketplace_test;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";
CREATE EXTENSION IF NOT EXISTS "postgis";
