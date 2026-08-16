"use client";

import { useActionState } from "react";
import { signInAction, signUpAction, type AuthFormState } from "./actions";

const EMPTY: AuthFormState = {};

const fieldClass =
  "w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus-visible:border-neutral-900 focus-visible:ring-2 focus-visible:ring-neutral-900/20";

export function SignInForm() {
  const [signInState, signIn, signingIn] = useActionState(signInAction, EMPTY);
  const [signUpState, signUp, signingUp] = useActionState(signUpAction, EMPTY);

  const state = signInState.error || signInState.notice ? signInState : signUpState;
  const busy = signingIn || signingUp;

  return (
    <form className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-sm font-medium">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className={fieldClass}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-sm font-medium">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          minLength={8}
          required
          className={fieldClass}
        />
        <p className="text-xs text-neutral-500">At least 8 characters.</p>
      </div>

      {state.error ? (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
          {state.error}
        </p>
      ) : null}

      {state.notice ? (
        <p role="status" className="rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-900">
          {state.notice}
        </p>
      ) : null}

      <div className="flex gap-3">
        <button
          type="submit"
          formAction={signIn}
          disabled={busy}
          className="flex-1 rounded-md bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-neutral-700 disabled:opacity-60"
        >
          {signingIn ? "Signing in…" : "Sign in"}
        </button>
        <button
          type="submit"
          formAction={signUp}
          disabled={busy}
          className="flex-1 rounded-md border border-neutral-300 px-4 py-2.5 text-sm font-medium transition-colors hover:bg-neutral-100 disabled:opacity-60"
        >
          {signingUp ? "Creating…" : "Create account"}
        </button>
      </div>
    </form>
  );
}
