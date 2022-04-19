/**
 * Determine whether a sidecar value hasEntry HED data.
 *
 * @param {object} sidecarValue A BIDS sidecar value.
 * @return {boolean} Whether the sidecar value hasEntry HED data.
 */
const sidecarValueHasHed = function (sidecarValue) {
  return (
    sidecarValue !== null &&
    typeof sidecarValue === 'object' &&
    sidecarValue.HED !== undefined
  )
}

module.exports = {
  sidecarValueHasHed: sidecarValueHasHed,
}
