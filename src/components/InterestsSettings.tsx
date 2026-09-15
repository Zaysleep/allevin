"use client";

import { ChevronDown, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import {
   interestSummary,
   readInterestPreferences,
   saveInterestPreferences,
   type AllevinInterestPreferences,
   type SportsTeamPreference,
} from "@/lib/allevinInterests";

type InterestPanel = "weather" | "stocks" | "sports" | "briefing";

function InterestPanelSection({
   id,
   title,
   summary,
   active,
   onToggle,
   children,
}: {
   id: InterestPanel;
   title: string;
   summary: string;
   active: InterestPanel | null;
   onToggle: (id: InterestPanel) => void;
   children: React.ReactNode;
}) {
   const open = active === id;
   return (
      <section className={`interest-panel ${open ? "interest-panel-open" : ""}`}>
         <button type="button" className="interest-panel-trigger" onClick={() => onToggle(id)} aria-expanded={open}>
            <span><strong>{title}</strong><small>{summary}</small></span>
            <ChevronDown size={17} aria-hidden="true" />
         </button>
         {open ? <div className="interest-panel-body">{children}</div> : null}
      </section>
   );
}

function ToggleRow({ title, detail, enabled, onChange }: { title: string; detail: string; enabled: boolean; onChange: (enabled: boolean) => void }) {
   return (
      <div className="settings-reminder-row interest-toggle-row">
         <div><strong>{title}</strong><span>{detail}</span></div>
         <button type="button" className="settings-inline-button" onClick={() => onChange(!enabled)}>{enabled ? "On" : "Off"}</button>
      </div>
   );
}

function DayPicker({ value, onChange }: { value: number[]; onChange: (days: number[]) => void }) {
   const days = ["S", "M", "T", "W", "T", "F", "S"];
   return (
      <div className="interest-day-picker" aria-label="Delivery days">
         {days.map((label, day) => (
            <button key={`${label}-${day}`} type="button" className={value.includes(day) ? "selected" : ""} onClick={() => {
               const next = value.includes(day) ? value.filter((candidate) => candidate !== day) : [...value, day].sort();
               if (next.length) onChange(next);
            }}>{label}</button>
         ))}
      </div>
   );
}

function makeTeam(name: string, league: SportsTeamPreference["league"]): SportsTeamPreference {
   return {
      id: `team-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now()}`,
      name: name.trim(),
      league,
      gameDay: true,
      pregame: true,
      finalScore: true,
      pregameMinutes: 30,
   };
}

export default function InterestsSettings() {
   const [preferences, setPreferences] = useState<AllevinInterestPreferences>(() => readInterestPreferences());
   const [active, setActive] = useState<InterestPanel | null>("weather");
   const [tickerInput, setTickerInput] = useState("");
   const [teamName, setTeamName] = useState("");
   const [teamLeague, setTeamLeague] = useState<SportsTeamPreference["league"]>("MLB");

   function commit(next: AllevinInterestPreferences) {
      setPreferences(next);
      saveInterestPreferences(next);
   }

   function update<K extends keyof AllevinInterestPreferences>(key: K, changes: Partial<AllevinInterestPreferences[K]>) {
      commit({ ...preferences, [key]: { ...preferences[key], ...changes } });
   }

   function addTickers() {
      const incoming = tickerInput.toUpperCase().split(/[\s,]+/).map((symbol) => symbol.trim()).filter((symbol) => /^[A-Z][A-Z0-9.-]{0,10}$/.test(symbol));
      if (!incoming.length) return;
      update("stocks", { enabled: true, symbols: [...new Set([...preferences.stocks.symbols, ...incoming])].slice(0, 20) });
      setTickerInput("");
   }

   function addTeam() {
      const name = teamName.trim();
      if (!name) return;
      update("sports", { enabled: true, teams: [...preferences.sports.teams, makeTeam(name, teamLeague)].slice(0, 12) });
      setTeamName("");
   }

   function updateTeam(id: string, changes: Partial<SportsTeamPreference>) {
      update("sports", { teams: preferences.sports.teams.map((team) => team.id === id ? { ...team, ...changes } : team) });
   }

   const togglePanel = (id: InterestPanel) => setActive((current) => current === id ? null : id);
   const stockSummary = preferences.stocks.symbols.length ? preferences.stocks.symbols.join(", ") : "No stocks tracked";
   const sportsSummary = preferences.sports.teams.length ? preferences.sports.teams.map((team) => team.name).join(", ") : "No teams followed";

   return (
      <div className="interests-settings">
         <p className="settings-panel-intro">Choose what ALLEVIN remembers and when it should reach you. Anything changed here also updates chat.</p>

         <InterestPanelSection id="weather" title="Weather" summary={preferences.weather.location || "Location needed"} active={active} onToggle={togglePanel}>
            <ToggleRow title="Weather" detail="Answer weather questions and use current conditions in briefings." enabled={preferences.weather.enabled} onChange={(enabled) => update("weather", { enabled })} />
            <label className="settings-field"><span>Location</span><input value={preferences.weather.location} onChange={(event) => update("weather", { location: event.target.value })} placeholder="San Diego, CA" maxLength={100} /></label>
            <label className="settings-field"><span>Temperature</span><select value={preferences.weather.unit} onChange={(event) => update("weather", { unit: event.target.value === "celsius" ? "celsius" : "fahrenheit" })}><option value="fahrenheit">Fahrenheit</option><option value="celsius">Celsius</option></select></label>
            <ToggleRow title="Morning weather" detail="Send a fresh weather update at the time below." enabled={preferences.weather.morningEnabled} onChange={(morningEnabled) => update("weather", { enabled: morningEnabled || preferences.weather.enabled, morningEnabled })} />
            {preferences.weather.morningEnabled ? <label className="settings-field"><span>Delivery time</span><input type="time" value={preferences.weather.morningTime} onChange={(event) => update("weather", { morningTime: event.target.value })} /></label> : null}
            <ToggleRow title="Outdoor conditions" detail="Include rain, heat, UV, and air quality when they matter." enabled={preferences.weather.outdoorConditions} onChange={(outdoorConditions) => update("weather", { outdoorConditions })} />
         </InterestPanelSection>

         <InterestPanelSection id="stocks" title="Stocks" summary={stockSummary} active={active} onToggle={togglePanel}>
            <ToggleRow title="Stock watchlist" detail="Remember selected tickers for questions and reports." enabled={preferences.stocks.enabled} onChange={(enabled) => update("stocks", { enabled })} />
            <div className="interest-add-row"><label><span>Add ticker symbols</span><input value={tickerInput} onChange={(event) => setTickerInput(event.target.value)} placeholder="GM, NBIS, CRWV" maxLength={120} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addTickers(); } }} /></label><button type="button" onClick={addTickers} aria-label="Add stocks"><Plus size={18} /></button></div>
            {preferences.stocks.symbols.length ? <div className="interest-chip-list">{preferences.stocks.symbols.map((symbol) => <span key={symbol}>{symbol}<button type="button" onClick={() => update("stocks", { symbols: preferences.stocks.symbols.filter((item) => item !== symbol) })} aria-label={`Remove ${symbol}`}><Trash2 size={13} /></button></span>)}</div> : null}
            <ToggleRow title="Weekday report" detail="A concise watchlist snapshot on selected days." enabled={preferences.stocks.reportEnabled} onChange={(reportEnabled) => update("stocks", { enabled: reportEnabled || preferences.stocks.enabled, reportEnabled })} />
            {preferences.stocks.reportEnabled ? <><label className="settings-field"><span>Report time</span><input type="time" value={preferences.stocks.reportTime} onChange={(event) => update("stocks", { reportTime: event.target.value })} /></label><DayPicker value={preferences.stocks.reportDays} onChange={(reportDays) => update("stocks", { reportDays })} /></> : null}
            <ToggleRow title="Monthly review" detail="A watchlist check-in on the first of each month." enabled={preferences.stocks.monthlyReviewEnabled} onChange={(monthlyReviewEnabled) => update("stocks", { enabled: monthlyReviewEnabled || preferences.stocks.enabled, monthlyReviewEnabled })} />
            {preferences.stocks.monthlyReviewEnabled ? <label className="settings-field"><span>First-of-month time</span><input type="time" value={preferences.stocks.monthlyReviewTime} onChange={(event) => update("stocks", { monthlyReviewTime: event.target.value })} /></label> : null}
            <ToggleRow title="Important dates" detail="Include earnings dates and market closures when available." enabled={preferences.stocks.importantDates} onChange={(importantDates) => update("stocks", { importantDates })} />
         </InterestPanelSection>

         <InterestPanelSection id="sports" title="Sports" summary={sportsSummary} active={active} onToggle={togglePanel}>
            <ToggleRow title="Followed teams" detail="Ask for schedules and scores, then choose automatic updates below." enabled={preferences.sports.enabled} onChange={(enabled) => update("sports", { enabled })} />
            <div className="interest-team-add"><label><span>Team</span><input value={teamName} onChange={(event) => setTeamName(event.target.value)} placeholder="San Diego Padres" maxLength={80} /></label><label><span>League</span><select value={teamLeague} onChange={(event) => setTeamLeague(event.target.value as SportsTeamPreference["league"])}><option>MLB</option><option>NBA</option><option>NFL</option><option>NHL</option><option value="other">Other</option></select></label><button type="button" onClick={addTeam}><Plus size={17} /> Add team</button></div>
            <ToggleRow title="Hide scores" detail="Keep automatic updates spoiler-free. Direct score questions still work." enabled={preferences.sports.noSpoilers} onChange={(noSpoilers) => update("sports", { noSpoilers })} />
            <label className="settings-field"><span>Game-day update time</span><input type="time" value={preferences.sports.gameDayTime} onChange={(event) => update("sports", { gameDayTime: event.target.value })} /></label>
            <div className="interest-team-list">{preferences.sports.teams.map((team) => (
               <article key={team.id}>
                  <header><div><strong>{team.name}</strong><span>{team.league}</span></div><button type="button" onClick={() => update("sports", { teams: preferences.sports.teams.filter((candidate) => candidate.id !== team.id) })} aria-label={`Remove ${team.name}`}><Trash2 size={16} /></button></header>
                  <div className="interest-team-options">
                     <label><input type="checkbox" checked={team.gameDay} onChange={(event) => updateTeam(team.id, { gameDay: event.target.checked })} /> Game day</label>
                     <label><input type="checkbox" checked={team.pregame} onChange={(event) => updateTeam(team.id, { pregame: event.target.checked })} /> Pregame</label>
                     <label><input type="checkbox" checked={team.finalScore} onChange={(event) => updateTeam(team.id, { finalScore: event.target.checked })} /> Final score</label>
                  </div>
                  {team.pregame ? <label className="interest-small-field"><span>Notify before</span><select value={team.pregameMinutes} onChange={(event) => updateTeam(team.id, { pregameMinutes: Number(event.target.value) })}><option value={15}>15 minutes</option><option value={30}>30 minutes</option><option value={60}>1 hour</option></select></label> : null}
               </article>
            ))}</div>
         </InterestPanelSection>

         <InterestPanelSection id="briefing" title="Daily briefing" summary={preferences.briefing.enabled ? `At ${preferences.briefing.time}` : "Off"} active={active} onToggle={togglePanel}>
            <ToggleRow title="Daily briefing" detail="Combine selected interests into one concise update." enabled={preferences.briefing.enabled} onChange={(enabled) => update("briefing", { enabled })} />
            {preferences.briefing.enabled ? <><label className="settings-field"><span>Delivery time</span><input type="time" value={preferences.briefing.time} onChange={(event) => update("briefing", { time: event.target.value })} /></label><DayPicker value={preferences.briefing.days} onChange={(days) => update("briefing", { days })} /><div className="interest-briefing-options"><label><input type="checkbox" checked={preferences.briefing.includeWeather} onChange={(event) => update("briefing", { includeWeather: event.target.checked })} /> Weather</label><label><input type="checkbox" checked={preferences.briefing.includeStocks} onChange={(event) => update("briefing", { includeStocks: event.target.checked })} /> Stocks</label><label><input type="checkbox" checked={preferences.briefing.includeSports} onChange={(event) => update("briefing", { includeSports: event.target.checked })} /> Sports</label></div></> : null}
         </InterestPanelSection>

         <p className="interests-footer-summary">{interestSummary(preferences)}</p>
      </div>
   );
}
