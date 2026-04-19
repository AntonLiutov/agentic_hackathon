from __future__ import annotations

import argparse
import asyncio
import sys
from dataclasses import asdict
from pathlib import Path

from app.core.config import get_settings
from app.db.session import DatabaseManager
from app.demo.service import seed_demo_data


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Seed deterministic demo data for Agentic Chat.")
    parser.add_argument(
        "--database-url",
        type=str,
        default=None,
        help="Override the database URL used for seeding.",
    )
    parser.add_argument(
        "--attachments-dir",
        type=str,
        default=None,
        help="Override the attachments directory used when creating demo files.",
    )
    parser.add_argument(
        "--large-history-count",
        type=int,
        default=5_000,
        help="Number of messages to seed into the demo history-lab room.",
    )
    parser.add_argument(
        "--history-chunk-size",
        type=int,
        default=1_000,
        help="Chunk size used for bulk long-history inserts.",
    )
    parser.add_argument(
        "--no-replace",
        action="store_true",
        help="Do not remove an existing demo dataset before seeding.",
    )
    return parser.parse_args()


def _resolve_database_url(configured_url: str) -> str:
    if "@postgres:" in configured_url:
        return configured_url.replace("@postgres:", "@localhost:")
    return configured_url


def _resolve_attachments_dir(configured_path: str) -> str:
    if configured_path == "/data/attachments":
        return str(Path(__file__).resolve().parents[3] / "storage" / "attachments")
    return configured_path


def _log_progress(message: str) -> None:
    print(f"[seed] {message}", flush=True)


async def main() -> None:
    args = parse_args()
    settings = get_settings()
    runtime_settings = settings.model_copy(
        update={
            "database_url": args.database_url or _resolve_database_url(settings.database_url),
            "attachments_dir": args.attachments_dir
            or _resolve_attachments_dir(settings.attachments_dir),
        }
    )
    manager = DatabaseManager(runtime_settings.database_url)
    _log_progress(
        "Starting demo seeding with "
        f"history_count={args.large_history_count}, "
        f"chunk_size={args.history_chunk_size}, "
        f"replace={not args.no_replace}."
    )
    _log_progress(f"Using database URL: {runtime_settings.database_url}")
    _log_progress(f"Using attachments dir: {runtime_settings.attachments_dir}")

    try:
        summary = await seed_demo_data(
            manager.session_factory,
            settings=runtime_settings,
            large_history_count=args.large_history_count,
            history_chunk_size=args.history_chunk_size,
            replace=not args.no_replace,
            progress_callback=_log_progress,
        )
    finally:
        _log_progress("Disposing database connections.")
        await manager.dispose()

    print("Demo data seeded successfully.")
    for key, value in asdict(summary).items():
        print(f"- {key}: {value}")
    print(
        "- demo_usernames: demo.alice, demo.bob, demo.carol, demo.dave, "
        "demo.erin, demo.frank, demo.grace, demo.henry"
    )


if __name__ == "__main__":
    if sys.platform.startswith("win") and hasattr(asyncio, "WindowsSelectorEventLoopPolicy"):
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(main())
