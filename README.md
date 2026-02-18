# Project Setup and Environment

This project requires **Node.js**, **MongoDB 4.2**, and **Redis 6.2**. This README provides detailed steps to set up the environment, install dependencies, and initialize the database with sample data.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Node.js Setup](#nodejs-setup)
3. [MongoDB 4.2 Installation](#mongodb-42-installation)
4. [MongoDB CLI Usage](#mongodb-cli-usage)
5. [Redis 6.2 Installation](#redis-62-installation)

---

## Prerequisites

- Ubuntu 18.04 / 20.04 recommended
- sudo privileges
- Basic command line knowledge

---

## Node.js Setup

**Node Version:** 20.19.6  

Install project dependencies:

```bash
npm install
node -v
npm -v
```

---

## MongoDB 4.2 Installation

Before installing MongoDB, ensure the required SSL library is installed:

0. Install libssl1.1
```bash
echo "deb http://security.ubuntu.com/ubuntu focal-security main" | sudo tee /etc/apt/sources.list.d/focal-security.list
sudo apt update
sudo apt install -y libssl1.1
sudo rm /etc/apt/sources.list.d/focal-security.list
sudo apt update
```

1. Add MongoDB GPG Key  
```bash
curl -fsSL https://pgp.mongodb.com/server-4.2.asc | sudo gpg -o /usr/share/keyrings/mongodb-server-4.2.gpg --dearmor
```

2. Add Repository
```bash
echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-4.2.gpg ] https://repo.mongodb.org/apt/ubuntu bionic/mongodb-org/4.2 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-4.2.list

sudo apt-get update
```

3. Install MongoDB
```bash
sudo apt-get install -y mongodb-org
```

4. Prepare Directories
```bash
sudo mkdir -p /var/lib/mongodb /var/log/mongodb
sudo chown -R mongodb:mongodb /var/lib/mongodb /var/log/mongodb
```

5. Start MongoDB
```bash
sudo -u mongodb /usr/bin/mongod --config /etc/mongod.conf &
```

6. Verify Installation
```bash
mongod --version
```

Expected output:
```
db version v4.2.25
git version: 41b59c2bfb5121e66f18cc3ef40055a1b5fb6c2e
OpenSSL version: OpenSSL 1.1.1f  31 Mar 2020
allocator: tcmalloc
modules: none
build environment: ubuntu1804
```

## MongoDB CLI Usage
1. Connect to MongoDB
```bash
mongo
```

2. Create Database and Collections
```bash
use files_manager

db.createCollection('users')
db.createCollection('files')

db.getCollectionNames()  // Output: [ "files", "users" ]
```

3. Insert Sample Users
```bash
db.users.insertMany([
  { name: 'Bob', email: 'bob@example.com' },
  { name: 'Alice', email: 'alice@example.com' },
  { name: 'Charlie', email: 'charlie@example.com' },
  { name: 'Diana', email: 'diana@example.com' }
]);
```

4. Insert Sample Files
```bash
db.files.insertMany([
  { title: 'file_a0' }, { title: 'file_a1' }, { title: 'file_a2' },
  { title: 'file_a3' }, { title: 'file_a4' }, { title: 'file_a5' },
  { title: 'file_a6' }, { title: 'file_a7' }, { title: 'file_a8' },
  { title: 'file_a9' }, { title: 'file_a10' }, { title: 'file_a11' },
  { title: 'file_a12' }, { title: 'file_a13' }, { title: 'file_a14' },
  { title: 'file_a15' }, { title: 'file_a16' }, { title: 'file_a17' },
  { title: 'file_a18' }, { title: 'file_a19' }, { title: 'file_a20' },
  { title: 'file_a21' }, { title: 'file_a22' }, { title: 'file_a23' },
  { title: 'file_a24' }, { title: 'file_a25' }, { title: 'file_a26' },
  { title: 'file_a27' }, { title: 'file_a28' }, { title: 'file_a29' }
]);
```

5. Basic Queries
```bash
db.users.find({})
db.files.find({})
db.files.count()
db.users.count()
db.files.deleteOne({name: "images"})
```

## Redis 6.2 Installation
1. Install Prerequisites
```bash
sudo apt-get update
sudo apt-get install build-essential tcl
```

2. Download, Compile, and Install Redis
```bash
cd /tmp
wget http://download.redis.io/releases/redis-6.2.13.tar.gz
tar xzf redis-6.2.13.tar.gz
cd redis-6.2.13
make
sudo make install
```

3. Start Redis
```bash
redis-server /etc/redis/redis.conf
```

4. Verify Redis
```bash
redis-cli ping  # Output: PONG
```