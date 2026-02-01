# 🚀 OPUS CODING WORKFLOW

## 🎯 **SPECIALIZED SUB-AGENT ARCHITECTURE**

### **High-Quality Coding Agent** 🧠
- **Session:** `opus-coder` 
- **Model:** Claude Sonnet 4 (best available)
- **Thinking:** High (deep analysis)
- **Purpose:** Generate world-class code with maximum quality
- **Specializes in:** Architecture, algorithms, full-stack development

### **Efficient Code Review Agent** ⚡
- **Session:** `code-reviewer`
- **Model:** Default (cost-optimized)  
- **Thinking:** Low (fast reviews)
- **Purpose:** Quick quality audits and optimization suggestions
- **Specializes in:** Bug detection, security, best practices

## 🔄 **WORKFLOW PATTERNS**

### **Pattern 1: Complex New Project**
```
1. Main Agent → Define requirements & scope
2. Opus Coder → Design architecture & implement core
3. Code Reviewer → Audit for issues & improvements  
4. Opus Coder → Refine based on feedback (if needed)
5. Main Agent → Deploy & document
```

### **Pattern 2: Quick Script/Tool**
```
1. Opus Coder → Direct implementation
2. Code Reviewer → Quick security/bug check
3. Deploy immediately
```

### **Pattern 3: Debug/Optimize Existing Code**
```
1. Code Reviewer → Identify issues & bottlenecks
2. Opus Coder → Implement fixes & optimizations
3. Code Reviewer → Validate improvements
```

## 📝 **USAGE COMMANDS**

### **Send to Coding Agent:**
```
/send opus-coder "Build a FastAPI server with JWT authentication and PostgreSQL integration"
```

### **Send to Review Agent:**
```
/send code-reviewer "Review this Python code for security and performance issues: [paste code]"
```

### **Check Agent Status:**
```
/sessions list
```

## 💡 **BEST PRACTICES**

### **Cost Optimization:**
- ✅ Use **Opus Coder** for complex algorithms, architecture, new features
- ✅ Use **Code Reviewer** for bug checks, optimizations, simple validation
- ✅ Use **Main Agent** for planning, documentation, deployment

### **Quality Maximization:**
- 🧠 **Opus Coder** uses high thinking for deep analysis
- ⚡ **Code Reviewer** provides fast, focused audits
- 🔄 **Iterative refinement** between agents when needed

### **When to Use Which Agent:**

**Opus Coder** (Premium Quality):
- New complex applications/systems
- Advanced algorithms & data structures  
- API design & architecture decisions
- Performance-critical code optimization
- Complex debugging & troubleshooting

**Code Reviewer** (Cost Efficient):
- Security audits & vulnerability checks
- Code style & best practice validation
- Simple bug detection
- Documentation review
- Quick optimization suggestions

## 🎯 **EXAMPLE WORKFLOWS**

### **Polymarket Arbitrage Bot Enhancement:**
```bash
# 1. Architecture & core logic
/send opus-coder "Enhance our arbitrage detector with real-time WebSocket monitoring, better error handling, and multi-market support"

# 2. Security review  
/send code-reviewer "Review this trading bot code for security vulnerabilities and API rate limiting issues"

# 3. Final optimization
/send opus-coder "Optimize the WebSocket connection handling based on the reviewer's feedback"
```

### **New Tool Development:**
```bash
# 1. Full implementation
/send opus-coder "Build a CLI tool for managing OpenClaw configurations with validation and backup features"

# 2. Quality check
/send code-reviewer "Audit this CLI tool for edge cases and user experience issues"
```

## 📊 **SESSION MANAGEMENT**

### **Active Sessions:**
- `main` - General coordination & deployment
- `opus-coder` - High-quality code generation  
- `code-reviewer` - Efficient code auditing

### **Cleanup Policy:**
- Sessions are kept persistent (`cleanup: keep`)
- Can be terminated when not needed to save resources
- Respawn as needed for new projects

---

**🚀 Ready to generate world-class code with optimized costs!**

Use this workflow for all coding tasks - from quick scripts to complex systems.