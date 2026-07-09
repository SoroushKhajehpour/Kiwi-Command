"use client";

import { useState } from "react";
import { ParkingGarage } from "@/components/ParkingGarage";
import { INITIAL_ROBOTS, INITIAL_VEHICLES, PARKING_SPOTS } from "@/lib/mockData";

/**
 * Temporary preview page — renders the garage canvas with mock data.
 * Replaced by the full dashboard layout in the final wiring step.
 */
export default function Home() {
  const [selectedSpotId, setSelectedSpotId] = useState<string | null>(null);

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">
      <ParkingGarage
        spots={PARKING_SPOTS}
        vehicles={INITIAL_VEHICLES}
        robots={INITIAL_ROBOTS}
        selectedSpotId={selectedSpotId}
        onSelectSpot={setSelectedSpotId}
      />
    </main>
  );
}
