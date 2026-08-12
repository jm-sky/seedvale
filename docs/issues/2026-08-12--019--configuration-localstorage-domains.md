# 019 — Separate configuration domains in localStorage

**Status:** `done`

## Problem

Configuration persistence should not mix unrelated settings in one localStorage entry. Different domains have different lifecycles and should be independently readable, writable and resettable.

## Expected behaviour

Use separate localStorage keys/domains for at least:

- graphics quality,
- effects related to changing the world seed, if any,
- player options,
- world options.

Avoid introducing a second parallel configuration mechanism; keep the existing configuration objects as the source of runtime values and separate only their persistence boundaries.

## Goal

Make configuration persistence explicit, maintainable and safe to change independently by domain.
