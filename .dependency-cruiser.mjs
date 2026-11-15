import { config } from "@ambitious/depcruise";

export default { ...config, options: { ...config.options, exclude: { path: "(^|/)fixtures/" } } };
