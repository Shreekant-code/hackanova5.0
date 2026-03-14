const sizeMap = {
  sm: "h-4 w-4 border-2",
  md: "h-6 w-6 border-2",
  lg: "h-9 w-9 border-[3px]",
};

const Spinner = ({ label = "Loading...", size = "md" }) => (
  <div className="inline-flex items-center gap-3 text-slate-600">
    <span
      className={`inline-block animate-spin rounded-full border-slate-200 border-t-blue-600 ${
        sizeMap[size] || sizeMap.md
      }`}
      aria-hidden="true"
    />
    <span className="text-sm font-medium">{label}</span>
  </div>
);

export default Spinner;
