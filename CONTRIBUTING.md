# Contributing to DLX

Thank you for your interest in contributing to **DLX Download Manager**!

DLX is built as an accelerated, high-performance multi-part desktop download manager powered by Electron, TypeScript, React, and Vite.

---

## 🛠️ Development Setup

### Prerequisites
- **Node.js**: v20 or v22+ (LTS recommended)
- **npm**: v10+
- **Git**

### Installation

1. Fork and clone the repository:
   ```bash
   git clone https://github.com/kurui-ian/DLX.git
   cd DLX
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Launch development mode (Vite hot-reloading + Electron):
   ```bash
   npm run dev
   ```

---

## 🧪 Testing & Verification

Before submitting pull requests or making commits, verify that your changes pass all build checks and unit tests:

```bash
# Run unit tests
npm test

# Type-check and compile renderer process
npm run build:renderer

# Type-check and compile main process
npm run build:main

# Full build verification
npm run build
```

---

## 📦 Building Distributables

To package standalone desktop installers and portable executables for Windows:

```bash
npm run dist
```
Distribution packages will be outputted to the `release/` directory.

---

## 📝 Commit Conventions

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

- `feat:` A new user-facing feature or enhancement
- `fix:` A bug fix
- `docs:` Documentation improvements (e.g. README, ARCHITECTURE)
- `perf:` Performance optimizations
- `refactor:` Code changes that neither fix bugs nor add features
- `test:` Adding or updating automated tests
- `style:` Formatting, UI styles, or accessibility labels
- `chore:` Maintenance, dependency bumps, or workflow changes

Example:
```
feat(engine): add adaptive stream bandwidth throttling
fix(youtube): resolve 1080p stream mime-type parsing
docs(readme): add installation guide for browser companion
```

---

## 🤝 Pull Request Process

1. Create a feature branch off `main`:
   ```bash
   git checkout -b feature/your-feature-name
   ```
2. Keep commits concise, focused, and well-described.
3. Ensure all tests (`npm test`) and builds (`npm run build`) pass cleanly without warnings.
4. Open a Pull Request on GitHub with a clear explanation of changes and motivation.

---

## 👨‍💻 Project Maintainer

DLX is actively developed and maintained by **Kurui Ian Kipkemboi**.
