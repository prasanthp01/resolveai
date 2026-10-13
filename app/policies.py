"""Pure policies shared by the private pipeline and synthetic sandbox."""


def severity(rate):
    return "CRITICAL" if rate >= 50 else "HIGH" if rate >= 10 else "MEDIUM" if rate >= 1 else "LOW"
