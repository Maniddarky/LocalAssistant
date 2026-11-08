import re


def chunk_page(text: str, size: int = 480, overlap: int = 80) -> list[str]:
    """Split a page into windows that stay inside the MiniLM token limit."""
    cleaned = text.replace("\x00", " ")
    cleaned = re.sub(r"[ \t]+\n", "\n", cleaned)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned).strip()
    if not cleaned:
        return []
    if len(cleaned) <= size:
        return [cleaned]

    parts: list[str] = []
    start = 0
    while start < len(cleaned):
        end = min(len(cleaned), start + size)
        if end < len(cleaned):
            break_at = cleaned.rfind("\n", start + size // 2, end)
            if break_at == -1:
                break_at = cleaned.rfind(" ", start + size // 2, end)
            if break_at != -1:
                end = break_at
        piece = cleaned[start:end].strip()
        if piece:
            parts.append(piece)
        if end >= len(cleaned):
            break
        next_start = max(end - overlap, start + 1)
        space = cleaned.find(" ", next_start)
        newline = cleaned.find("\n", next_start)
        boundaries = [pos for pos in (space, newline) if pos != -1 and pos < end]
        if boundaries:
            next_start = min(boundaries) + 1
        if next_start <= start:
            next_start = start + 1
        start = next_start
    return parts
