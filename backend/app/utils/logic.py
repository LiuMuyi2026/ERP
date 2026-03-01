import re
from typing import Any, Callable, Dict

_IF_PATTERN = re.compile(
    r"IF\s+(?P<cond>.+?)\s+THEN\s+(?P<result>.+?)(?:\s+ELSE\s+(?P<else>.+))?$",
    re.IGNORECASE | re.DOTALL,
)
_STEP_FIELD_PATTERN = re.compile(r"\b([A-Za-z0-9_]+)\.([A-Za-z0-9_]+)\b")


def _prepare_expression(expression: str) -> str:
    expr = (expression or "").strip()
    if not expr:
        return "True"

    expr = expr.replace("AND", "and").replace("and", "and")
    expr = expr.replace("OR", "or").replace("or", "or")
    expr = expr.replace("NOT", "not").replace("not", "not")

    def _replace_step(match: re.Match[str]) -> str:
        step_key, field_key = match.groups()
        return f"steps.get('{step_key}', {{}}).get('{field_key}')"

    expr = _STEP_FIELD_PATTERN.sub(_replace_step, expr)

    # Handle IF ... THEN ... [ELSE ...]
    def _expand_if(sub_expr: str) -> str:
        match = _IF_PATTERN.search(sub_expr)
        if not match:
            return sub_expr
        cond = _expand_if(match.group('cond').strip())
        result = _expand_if(match.group('result').strip())
        else_clause = match.group('else')
        if else_clause:
            else_clause = _expand_if(else_clause.strip())
            replacement = f"(({cond}) and ({result})) or ({else_clause})"
        else:
            replacement = f"((not ({cond})) or ({result}))"
        return _expand_if(match.string[:match.start()] + replacement + (match.string[match.end():] if match.end() < len(match.string) else ""))

    expr = _expand_if(expr)

    return expr


def build_condition(expression: str) -> Callable[[Dict[str, Any]], bool]:
    prepared = _prepare_expression(expression)
    code = compile(prepared, '<condition>', 'eval')

    def evaluator(steps: Dict[str, Dict[str, Any]]) -> bool:
        try:
            return bool(eval(code, {}, {'steps': steps}))
        except Exception:
            return False

    return evaluator
