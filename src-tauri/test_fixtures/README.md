# Git Merge Conflict Test Fixtures

用于测试 Git 合并冲突检测和解决功能的测试夹具。

## 场景列表

| 目录 | 场景 | 冲突类型 |
|------|------|----------|
| `basic_conflict/` | 基本冲突 — 同一文件同一行被两边不同修改 | 行级冲突 |
| `multiple_conflicts/` | 单文件多个独立冲突块 | 多 hunk 冲突 |
| `consecutive_conflicts/` | 连续相邻的冲突块（配置文件的连续行被修改） | 相邻 hunk 合并 |
| `rename_conflict/` | 两边同时重命名同一文件 | rename/rename 冲突 |
| `clean_merge/` | 无冲突合并（对照组） | 无冲突 |

## 使用方式

所有仓库都是真实可操作的 Git 仓库，处于合并冲突状态（除 `clean_merge` 外）。

```bash
# 查看冲突文件
cd basic_conflict/
cat hello.py

# 查看所有冲突标记
grep -rn '<<<<<<<' .

# 解决冲突后提交
git add hello.py
git commit
```

## 注意事项

- 每个仓库的 `user.email` 和 `user.name` 已设置为测试值
- 仓库当前处于 `main` 分支的合并中状态
- 通过 `git merge --abort` 可取消合并
