import ast
import io
import json
import sys
import tokenize


def comments(path):
    with open(path, "rb") as file:
        source = file.read()
    found = []
    for token in tokenize.tokenize(io.BytesIO(source).readline):
        if token.type != tokenize.COMMENT:
            continue
        line, column = token.start
        if line == 1 and token.string.startswith("#!"):
            continue
        found.append({"line": line, "column": column + 1, "text": token.string})
    for node in ast.walk(ast.parse(source, path)):
        is_string_statement = (
            isinstance(node, ast.Expr)
            and isinstance(node.value, ast.Constant)
            and isinstance(node.value.value, str)
        )
        if is_string_statement:
            first_line = node.value.value.strip().split("\n", 1)[0]
            found.append(
                {
                    "line": node.lineno,
                    "column": node.col_offset + 1,
                    "text": f'"""{first_line[:70]}"""',
                }
            )
    return found


for path in sys.stdin.read().splitlines():
    print(json.dumps({"path": path, "comments": comments(path)}))
