import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { BoardRow } from "../../components/board-row";
import { Filters } from "../../components/filters";
import { DisclaimerD2 } from "../../components/disclaimer-d2";
import { color, font, space } from "../../lib/tokens";
import { EMPTY_FILTERS, boardWindowStart, filterBoard, getBoard, type BoardFilters, type BoardProfile } from "../../lib/board";

/* The crew board (slice 1, Task 3). Fetches GET /api/board once and filters
   in memory — the four SOW filters {role, port, availability date,
   verified-only}, exactly matching apps/web/app/directory/page.tsx.
   Fonts are loaded once in _layout.tsx, not here. */

export default function BoardScreen() {
  const [profiles, setProfiles] = useState<BoardProfile[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [filters, setFilters] = useState<BoardFilters>(EMPTY_FILTERS);

  // No synchronous setState in the fetch body itself — only inside the
  // promise callbacks below — so mount-time invocation from the effect
  // doesn't trigger cascading synchronous renders.
  const fetchOnce = useCallback(() => {
    getBoard()
      .then((p) => setProfiles(p))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchOnce();
  }, [fetchOnce]);

  const retry = useCallback(() => {
    setError(false);
    setLoading(true);
    fetchOnce();
  }, [fetchOnce]);

  const windowStart = useMemo(() => (profiles ? boardWindowStart(profiles) : undefined), [profiles]);
  const results = useMemo(() => (profiles ? filterBoard(profiles, filters) : []), [profiles, filters]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={color.navyDeep} />
        <Text style={styles.centerText}>Raising the board…</Text>
      </View>
    );
  }

  if (error || !profiles) {
    return (
      <View style={styles.center}>
        <Text style={styles.centerText}>Can&apos;t reach the board — check your connection.</Text>
        <Pressable style={styles.retry} onPress={retry} accessibilityRole="button">
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <FlatList
      style={styles.list}
      data={results}
      keyExtractor={(p) => p.id}
      renderItem={({ item }) => <BoardRow profile={item} windowStart={windowStart ?? item.availability[0]?.date ?? ""} />}
      ListHeaderComponent={
        <>
          <View style={styles.banner}>
            <Text style={styles.bannerTitle}>THE CREW BOARD</Text>
            <Text style={styles.bannerMeta}>
              Independent crew list their own services and set their own rates.
            </Text>
          </View>
          <Filters profiles={profiles} windowStart={windowStart} value={filters} onChange={setFilters} />
        </>
      }
      ListEmptyComponent={
        <View style={styles.empty}>
          <Text style={styles.emptyText}>
            No crew match these filters yet — the fishery is deep, the filters are narrow.
          </Text>
          <Pressable
            style={styles.emptyLinkTarget}
            hitSlop={12}
            onPress={() => setFilters(EMPTY_FILTERS)}
            accessibilityRole="button"
          >
            <Text style={styles.emptyLink}>Clear all filters</Text>
          </Pressable>
        </View>
      }
      ListFooterComponent={
        <>
          {results.length > 0 && (
            <View style={styles.footer}>
              <Text style={styles.footerCount}>
                {results.length} of {profiles.length} listed
              </Text>
              <Text style={styles.footerNote}>
                A brass seal means credentials passed admin review; everything else is self-reported.
              </Text>
            </View>
          )}
          {/* D-2 (conscious decision, approved): persistent footer disclaimer
              on the board screen, mirroring apps/web/app/layout.tsx's global
              footer — renders regardless of filter results. */}
          <DisclaimerD2 />
        </>
      }
    />
  );
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: color.boardBg },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: space.s4,
    padding: space.s5,
    backgroundColor: color.boardBg,
  },
  centerText: { fontFamily: font.body, fontSize: 15, color: color.inkSoft, textAlign: "center" },
  retry: {
    borderWidth: 1,
    borderColor: color.brass,
    paddingVertical: space.s3,
    paddingHorizontal: space.s5,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  retryText: { fontFamily: font.body, fontSize: 14, color: color.brassText, fontWeight: "600" },
  banner: { backgroundColor: color.navyDeep, padding: space.s5, gap: space.s2 },
  bannerTitle: {
    fontFamily: font.display,
    fontSize: 28,
    color: color.whiteCrisp,
    letterSpacing: 0.5,
  },
  bannerMeta: { fontFamily: font.body, fontSize: 14, color: color.navyMuted },
  empty: { padding: space.s5, gap: space.s2, alignItems: "flex-start" },
  emptyText: { fontFamily: font.body, fontSize: 14, color: color.inkSoft },
  emptyLinkTarget: { paddingVertical: space.s3, paddingHorizontal: space.s1, minHeight: 44, justifyContent: "center" },
  emptyLink: { fontFamily: font.body, fontSize: 14, color: color.brassText, fontWeight: "600" },
  footer: { padding: space.s5, gap: space.s2 },
  footerCount: { fontFamily: font.mono, fontSize: 12, color: color.inkSoft },
  footerNote: { fontFamily: font.body, fontSize: 12, color: color.inkSoft },
});
