from __future__ import annotations

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from starlette.concurrency import run_in_threadpool

from api.schemas import PackageInfo, PackageInstallStarted, PackagesResponse
from packages import (
    MANAGER as pkg_manager,
    list_packages as pkg_list_packages,
    stream_job as pkg_stream_job,
)
from src.i18n import t

router = APIRouter()


@router.get("/api/packages", response_model=PackagesResponse)
async def packages_list() -> PackagesResponse:
    items = await run_in_threadpool(pkg_list_packages)
    return PackagesResponse(packages=[PackageInfo(**item) for item in items])


@router.post("/api/packages/{package_id}/install", response_model=PackageInstallStarted)
async def packages_install(package_id: str) -> PackageInstallStarted:
    job_id = pkg_manager.start(package_id)
    if job_id is None:
        raise HTTPException(status_code=404, detail=t("packages.unknown"))
    return PackageInstallStarted(job_id=job_id)


@router.get("/api/packages/jobs/{job_id}/stream")
async def packages_stream(job_id: str) -> StreamingResponse:
    return StreamingResponse(
        pkg_stream_job(job_id),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/api/packages/jobs/{job_id}")
async def packages_job(job_id: str) -> dict:
    job = pkg_manager.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail=t("server.job_not_found"))
    return job.snapshot()
