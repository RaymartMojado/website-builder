"use client";

import { useActionState, useState } from "react";
import { createSiteAction, type SiteActionState } from "./actions";
import { sitesHostIsRoutable, suggestSubdomain } from "@/lib/sites/subdomain";

const EMPTY: SiteActionState = {};

const fieldClass =
  "w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus-visible:border-neutral-900 focus-visible:ring-2 focus-visible:ring-neutral-900/20 disabled:bg-neutral-100";

export function CreateSiteForm({
  disabled,
  sitesHost,
}: {
  disabled: boolean;
  sitesHost: string;
}) {
  const [state, submit, pending] = useActionState(createSiteAction, EMPTY);
  const [subdomain, setSubdomain] = useState("");
  const [touched, setTouched] = useState(false);

  // Suggest an address from the name until the user edits the address itself.
  function onNameChange(value: string) {
    if (!touched) setSubdomain(suggestSubdomain(value));
  }

  return (
    <form action={submit} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="name" className="text-sm font-medium">
            Site name
          </label>
          <input
            id="name"
            name="name"
            required
            maxLength={100}
            disabled={disabled}
            onChange={(event) => onNameChange(event.target.value)}
            className={fieldClass}
            placeholder="Acme Coffee"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="subdomain" className="text-sm font-medium">
            Address
          </label>
          <div className="flex items-center gap-1.5">
            <input
              id="subdomain"
              name="subdomain"
              required
              minLength={3}
              maxLength={63}
              disabled={disabled}
              value={subdomain}
              onChange={(event) => {
                setTouched(true);
                setSubdomain(event.target.value);
              }}
              className={fieldClass}
              placeholder="acme-coffee"
            />
            {/* Showing ".sites.invalid" would advertise an address that can
                never resolve. With no sites domain the site really does live
                at /s/{subdomain}, so say that instead. */}
            <span className="whitespace-nowrap font-mono text-xs text-neutral-500">
              {sitesHostIsRoutable(sitesHost) ? `.${sitesHost}` : `→ /s/${subdomain || "…"}`}
            </span>
          </div>
        </div>
      </div>

      {state.error ? (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
          {state.error}
        </p>
      ) : null}

      <div>
        <button
          type="submit"
          disabled={disabled || pending}
          className="rounded-md bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-neutral-700 disabled:opacity-60"
        >
          {pending ? "Creating…" : "Create site"}
        </button>
      </div>
    </form>
  );
}
