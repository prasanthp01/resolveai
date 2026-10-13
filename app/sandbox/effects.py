"""Ephemeral fake-ticket adapter used solely to exercise idempotent retries."""

import hashlib


class SyntheticTickets:
    def __init__(self):
        self.records = {}

    def create(self, run_id: str, operation: str):
        key = (run_id, operation)
        if key not in self.records:
            self.records[key] = {
                "id": "synthetic-" + hashlib.sha256((run_id + operation).encode()).hexdigest()[:12],
                "synthetic": True,
                "external_ticket_created": False,
            }
        return self.records[key]
