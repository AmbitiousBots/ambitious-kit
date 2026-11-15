import { ambitiousLint } from "@ambitious/lint";

export default ambitiousLint({ root: import.meta.dirname, ignores: ["**/fixtures/**", "release/**", ".tmp-*/**"] });
