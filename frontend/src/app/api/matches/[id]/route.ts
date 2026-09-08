import { NextResponse } from 'next/server';
import prisma from '@/lib/database';
import { requireAdminUser } from '@/lib/api-auth';
import { determineMatchStatus, updateMatchStatuses } from '@/utils/match-status-utils';
import { handleApiError, ApiErrors } from '@/lib/api-error';
import { MATCH_INCLUDE } from '@/lib/prisma-includes';
import { rateLimitGuard } from '@/lib/rate-limit';
import { validationErrorResponse } from '@/lib/validation';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminUser();
  if (!auth.ok) {
    return auth.response;
  }

  try {
    const { id } = await params;
    const match = await prisma.match.findUnique({
      where: { id },
      include: {
        ...MATCH_INCLUDE,
        rounds: {
          orderBy: {
            finishedAt: "desc",
          },
        },
      },
    });

    if (!match) {
      return NextResponse.json({ error: "Match not found." }, { status: 404 });
    }

    const matchWithPlayCounts = {
      ...match,
      players: match.players.map(({ player, ...matchPlayer }) => ({
        ...matchPlayer,
        player: {
          ...player,
          playCount: matchPlayer.playCount ?? 0,
        },
      })),
    };

    return NextResponse.json(matchWithPlayCounts);
  } catch (error) {
    return handleApiError(error, ApiErrors.serverError('fetch match'));
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminUser();
  if (!auth.ok) {
    return auth.response;
  }

  const rateLimited = rateLimitGuard(request);
  if (rateLimited) {
    return rateLimited;
  }

  try {
    const { id } = await params;
    const body = await request.json();
    const {
      title,
      location,
      courtNumber,
      date,
      time,
      fee,
      status,
      description,
      playerIds,
    } = body;

    // Never coerce an absent/invalid fee to 0: Number("") === 0, so an empty
    // or unparseable fee used to silently overwrite the stored value.
    const parsedFee = fee === undefined ? undefined : Number(fee);
    if (parsedFee !== undefined && (fee === null || fee === "" || Number.isNaN(parsedFee))) {
      return validationErrorResponse(["fee must be a number"]);
    }

    // Use shared utility to determine correct status
    const finalStatus = date && time && status
      ? determineMatchStatus(date, time, status)
      : status;

    // Preserve per-match round counts and payment status when the roster is
    // re-saved. Explicitly deleting old match_players before inserting new ones
    // in the same transaction avoids nested deleteMany/create unique-constraint collisions in Prisma.
    const match = await prisma.$transaction(async (tx) => {
      let existingRows: { playerId: string; playCount: number; paymentStatus: string }[] = [];
      if (Array.isArray(playerIds) && playerIds.length > 0) {
        existingRows = await tx.matchPlayer.findMany({
          where: { matchId: id, playerId: { in: playerIds } },
          select: { playerId: true, playCount: true, paymentStatus: true },
        });
      }
      const existingByPlayer = new Map(
        existingRows.map((row) => [row.playerId, row])
      );

      if (Array.isArray(playerIds)) {
        await tx.matchPlayer.deleteMany({
          where: { matchId: id },
        });

        if (playerIds.length > 0) {
          await tx.matchPlayer.createMany({
            data: playerIds.map((playerId: string) => {
              const existing = existingByPlayer.get(playerId);
              return {
                matchId: id,
                playerId,
                playCount: existing?.playCount ?? 0,
                paymentStatus: existing?.paymentStatus ?? "BELUM_SETOR",
              };
            }),
          });
        }
      }

      const parsedDate = date ? new Date(date) : undefined;
      const validDate = parsedDate && !isNaN(parsedDate.getTime()) ? parsedDate : undefined;

      return tx.match.update({
        where: { id },
        data: {
          title: title !== undefined ? String(title).trim() : undefined,
          location: location !== undefined ? String(location).trim() : undefined,
          courtNumber: courtNumber !== undefined ? (String(courtNumber).trim() || null) : undefined,
          date: validDate,
          time: time !== undefined ? time : undefined,
          fee: parsedFee,
          status: finalStatus,
          description: description !== undefined ? (String(description).trim() || null) : undefined,
        },
        include: MATCH_INCLUDE,
      });
    });

    // Auto-update other match statuses
    await updateMatchStatuses();

    return NextResponse.json(match);
  } catch (error) {
    return handleApiError(error, ApiErrors.serverError('update match'));
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminUser();
  if (!auth.ok) {
    return auth.response;
  }

  const rateLimited = rateLimitGuard(request);
  if (rateLimited) {
    return rateLimited;
  }

  try {
    const { id } = await params;

    // payments.matchId has no cascade, so clear them explicitly before the
    // match delete. Wrapped in a transaction so a failure can't leave the
    // match alive with its payments already gone (or vice versa).
    await prisma.$transaction([
      prisma.payment.deleteMany({ where: { matchId: id } }),
      prisma.match.delete({ where: { id } }),
    ]);

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleApiError(error, ApiErrors.serverError('delete match'));
  }
}
