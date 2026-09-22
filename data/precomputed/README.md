# Precomputed answers (optional)

Empty by default, and that is deliberate: **the deployed app calls the model live.**

This folder exists only as an escape hatch. If you are demoing on a platform with a hard
request timeout (Vercel Hobby caps a request at 60s, and cross-call analysis can take ~120s),
run `npm run precompute` to freeze locally computed answers here and commit them. The server
then serves those instead of calling the model for those specific requests.

Leave it empty to run everything live.
