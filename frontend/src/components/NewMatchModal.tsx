"use client";

import { useEffect, useRef, useState } from "react";
import { Match } from "@/types/types";
import Modal from "./ui/Modal";
import MatchPlayersSection from "./match/MatchPlayersSection";
import { PlayerOption } from "./SelectPlayersModal";
import { IconCalendar, IconClock, IconLoader, IconMinus, IconPlus } from "@tabler/icons-react";

interface MatchData {
  title: string;
  location: string;
  courtNumber: string;
  date: string;
  time: string;
  fee: number;
  status: string;
  description?: string;
  playerIds?: string[];
}

interface NewMatchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (matchData: MatchData) => void;
  editingMatch?: Match | null;
  isSubmitting?: boolean;
}

interface MatchFormState {
  title: string;
  location: string;
  courtNumber: string;
  date: string;
  startTime: string;
  endTime: string;
  fee: string;
  description: string;
  playerIds: string[];
}

const INITIAL_FORM_STATE: MatchFormState = {
  title: "",
  location: "",
  courtNumber: "1",
  date: "",
  startTime: "19:00",
  endTime: "21:00",
  fee: "",
  description: "",
  playerIds: [],
};

const parseTimeRange = (timeRange: string) => {
  const [start, end] = timeRange.split("-").map((value) => value.trim());

  return {
    startTime: start || "19:00",
    endTime: end || "21:00",
  };
};

export default function NewMatchModal({
  isOpen,
  onClose,
  onSubmit,
  editingMatch,
  isSubmitting = false,
}: NewMatchModalProps) {
  const [formData, setFormData] = useState<MatchFormState>(INITIAL_FORM_STATE);
  const [availablePlayers, setAvailablePlayers] = useState<PlayerOption[]>([]);
  const [isLoadingPlayers, setIsLoadingPlayers] = useState(false);
  const [playersError, setPlayersError] = useState<string | null>(null);
  const submittingRef = useRef(false);

  // Block closing the modal while a create/update request is in flight
  const handleClose = () => {
    if (isSubmitting) return;
    onClose();
  };

  // Keep the ref in sync so a fast double-click can't fire two submits
  useEffect(() => {
    submittingRef.current = isSubmitting;
  }, [isSubmitting]);

  useEffect(() => {
    if (isOpen) {
      // Reset the form and double-submit guard whenever the modal opens
      // (editing data is applied afterwards by the editingMatch effect)
      setFormData(INITIAL_FORM_STATE);
      setPlayersError(null);
      submittingRef.current = false;
      const fetchPlayers = async () => {
        setIsLoadingPlayers(true);
        try {
          const { authFetch } = await import("@/lib/auth-fetch");
          const response = await authFetch("/api/players");
          if (response.ok) {
            const data = await response.json();
            setAvailablePlayers(data);
          }
        } catch (error) {
          console.error("Error fetching players:", error);
          setPlayersError(
            "Couldn't load the player list. Close and reopen this window to try again."
          );
        } finally {
          setIsLoadingPlayers(false);
        }
      };
      fetchPlayers();
    }
  }, [isOpen]);

  useEffect(() => {
    if (editingMatch) {
      const { startTime, endTime } = parseTimeRange(editingMatch.time);
      const formattedDate = editingMatch.date
        ? new Date(editingMatch.date).toISOString().split("T")[0]
        : "";

      setFormData({
        title: editingMatch.title,
        location: editingMatch.location,
        courtNumber: editingMatch.courtNumber || "1",
        date: formattedDate,
        startTime,
        endTime,
        fee: String(editingMatch.fee ?? 0),
        description: editingMatch.description ?? "",
        playerIds: editingMatch.players?.map((p) => p.player.id) ?? [],
      });
    } else {
      setFormData(INITIAL_FORM_STATE);
    }
  }, [editingMatch]);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    // Prevent duplicate submissions while a request is in flight.
    // Flip the ref immediately (before the parent's isSubmitting prop lands)
    // so even a same-tick double click can't fire twice.
    if (submittingRef.current) return;
    submittingRef.current = true;

    const trimmedTitle = formData.title.trim();
    const trimmedLocation = formData.location.trim();
    const trimmedCourtNumber = formData.courtNumber.trim();
    const trimmedDescription = formData.description.trim();
    // A number input sanitizes thousand separators ("1.080.000") to an empty
    // value, which used to submit fee: 0 and wipe the stored fee; strip the
    // separators ourselves and fall back to the stored fee when unparseable.
    const feeValue = Number.parseInt(formData.fee.replace(/[^\d]/g, ""), 10);
    const fallbackFee = Number(editingMatch?.fee ?? 0) || 0;

    const matchData: MatchData = {
      title: trimmedTitle,
      location: trimmedLocation,
      courtNumber: trimmedCourtNumber,
      date: formData.date,
      time: `${formData.startTime}-${formData.endTime}`,
      fee: Number.isNaN(feeValue) ? fallbackFee : feeValue,
      status: editingMatch?.status ?? "UPCOMING",
      description: trimmedDescription,
      playerIds: formData.playerIds,
    };

    // The form is NOT reset here so the entered values stay visible while
    // the request is in flight (and survive an error). It resets on next open.
    onSubmit(matchData);
  };

  const handleChange = (
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => {
    const { name, value } = event.target;
    setFormData((previous) => ({
      ...previous,
      [name]: value,
    }));
  };

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={handleClose}
        title={editingMatch ? "Edit Match" : "Create New Match"}
        subtitle="Schedule a match and track your game."
        size="xl"
        footer={
          <>
            <button
              type="button"
              onClick={handleClose}
              disabled={isSubmitting}
              className="rounded-lg px-4 py-2 text-sm font-medium text-app-text-secondary transition hover:bg-app-hover hover:text-app-text-primary disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="new-match-form"
              disabled={isSubmitting}
              className="flex items-center gap-2 rounded-lg bg-app-primary px-5 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-app-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? (
                <>
                  <IconLoader size={15} className="animate-spin" />
                  {editingMatch ? "Updating..." : "Creating..."}
                </>
              ) : editingMatch ? (
                "Update Match"
              ) : (
                "Create Match"
              )}
            </button>
          </>
        }
      >
        <form id="new-match-form" onSubmit={handleSubmit} className="space-y-4">
          {/* Section: MATCH DETAILS */}
          <div>
            <h3 className="mb-3 text-[11px] font-bold uppercase tracking-wider text-app-text-muted">
              MATCH DETAILS
            </h3>

            {/* Title */}
            <div className="mb-3">
              <label htmlFor="title" className="mb-1.5 block text-xs font-medium text-app-text-secondary">
                Title
              </label>
              <input
                type="text"
                id="title"
                name="title"
                value={formData.title}
                onChange={handleChange}
                required
                placeholder="Match title..."
                minLength={3}
                className="w-full rounded-lg border border-app-border bg-app-input px-3.5 py-2 text-sm text-app-text-primary placeholder:text-app-text-muted focus:border-app-primary focus:outline-none transition-colors"
              />
            </div>

            {/* Location & Court # */}
            <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="location" className="mb-1.5 block text-xs font-medium text-app-text-secondary">
                  Location
                </label>
                <input
                  type="text"
                  id="location"
                  name="location"
                  value={formData.location}
                  onChange={handleChange}
                  required
                  placeholder="Court location..."
                  className="w-full rounded-lg border border-app-border bg-app-input px-3.5 py-2 text-sm text-app-text-primary placeholder:text-app-text-muted focus:border-app-primary focus:outline-none transition-colors"
                />
              </div>
              <div>
                <label htmlFor="courtNumber" className="mb-1.5 block text-xs font-medium text-app-text-secondary">
                  Court #
                </label>
                <div className="flex items-center rounded-lg border border-app-border bg-app-input transition-colors focus-within:border-app-primary">
                  <button
                    type="button"
                    onClick={() => {
                      const current = Number.parseInt(formData.courtNumber, 10) || 1;
                      setFormData((prev) => ({
                        ...prev,
                        courtNumber: String(Math.max(1, current - 1)),
                      }));
                    }}
                    className="px-3 py-2 text-app-text-muted hover:text-app-text-primary transition-colors"
                    aria-label="Decrease court number"
                  >
                    <IconMinus size={14} />
                  </button>
                  <input
                    type="number"
                    id="courtNumber"
                    name="courtNumber"
                    min="1"
                    value={formData.courtNumber}
                    onChange={handleChange}
                    placeholder="1"
                    required
                    className="w-full bg-transparent py-2 text-center text-sm text-app-text-primary placeholder:text-app-text-muted focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const current = Number.parseInt(formData.courtNumber, 10) || 0;
                      setFormData((prev) => ({
                        ...prev,
                        courtNumber: String(current + 1),
                      }));
                    }}
                    className="px-3 py-2 text-app-text-muted hover:text-app-text-primary transition-colors"
                    aria-label="Increase court number"
                  >
                    <IconPlus size={14} />
                  </button>
                </div>
              </div>
            </div>

            {/* Date & Start Time */}
            <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="date" className="mb-1.5 block text-xs font-medium text-app-text-secondary">
                  Date
                </label>
                <div className="relative">
                  <IconCalendar
                    size={15}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-app-text-muted"
                  />
                  <input
                    type="date"
                    id="date"
                    name="date"
                    value={formData.date}
                    onChange={handleChange}
                    required
                    className="w-full rounded-lg border border-app-border bg-app-input py-2 pl-9 pr-3.5 text-sm text-app-text-primary placeholder:text-app-text-muted focus:border-app-primary focus:outline-none transition-colors"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="startTime" className="mb-1.5 block text-xs font-medium text-app-text-secondary">
                  Start Time
                </label>
                <div className="relative">
                  <IconClock
                    size={15}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-app-text-muted"
                  />
                  <input
                    type="time"
                    id="startTime"
                    name="startTime"
                    value={formData.startTime}
                    onChange={handleChange}
                    required
                    className="w-full rounded-lg border border-app-border bg-app-input py-2 pl-9 pr-3.5 text-sm text-app-text-primary placeholder:text-app-text-muted focus:border-app-primary focus:outline-none transition-colors"
                  />
                </div>
              </div>
            </div>

            {/* End Time & Court Fee (Rp) */}
            <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="endTime" className="mb-1.5 block text-xs font-medium text-app-text-secondary">
                  End Time
                </label>
                <div className="relative">
                  <IconClock
                    size={15}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-app-text-muted"
                  />
                  <input
                    type="time"
                    id="endTime"
                    name="endTime"
                    value={formData.endTime}
                    onChange={handleChange}
                    required
                    className="w-full rounded-lg border border-app-border bg-app-input py-2 pl-9 pr-3.5 text-sm text-app-text-primary placeholder:text-app-text-muted focus:border-app-primary focus:outline-none transition-colors"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="fee" className="mb-1.5 block text-xs font-medium text-app-text-secondary">
                  Court Fee (Rp)
                </label>
                <input
                  type="number"
                  id="fee"
                  name="fee"
                  value={formData.fee}
                  onChange={handleChange}
                  required
                  placeholder="50,000"
                  min="0"
                  step="1000"
                  className="w-full rounded-lg border border-app-border bg-app-input px-3.5 py-2 text-sm text-app-text-primary placeholder:text-app-text-muted focus:border-app-primary focus:outline-none transition-colors"
                />
              </div>
            </div>

            {/* Description (optional) */}
            <div className="mb-3">
              <label htmlFor="description" className="mb-1.5 block text-xs font-medium text-app-text-secondary">
                Description (optional)
              </label>
              <textarea
                id="description"
                name="description"
                value={formData.description}
                onChange={handleChange}
                rows={3}
                placeholder="Add any notes about this match..."
                className="w-full rounded-lg border border-app-border bg-app-input px-3.5 py-2 text-sm text-app-text-primary placeholder:text-app-text-muted focus:border-app-primary focus:outline-none transition-colors resize-none"
              />
            </div>
          </div>

          {/* Section: PLAYERS */}
          <MatchPlayersSection
            playerIds={formData.playerIds}
            availablePlayers={availablePlayers}
            isLoadingPlayers={isLoadingPlayers}
            playersError={playersError}
            editingMatch={editingMatch}
            onChange={(playerIds) =>
              setFormData((prev) => ({ ...prev, playerIds }))
            }
            onPlayerCreated={(newPlayer) => {
              setAvailablePlayers((prev) => [...prev, newPlayer]);
            }}
          />
        </form>
      </Modal>
    </>
  );
}
