import { Save } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "react-toastify";
import { useAuth } from "../../context/AuthContext.jsx";
import { profileApi } from "../../services/api.js";
import Spinner from "../common/Spinner.jsx";

const initialState = {
  age: "",
  occupation: "",
  category: "",
  annual_income: "",
  gender: "",
  city: "",
  state: "",
  phone: "",
};

const ProfileForm = ({ onSaved }) => {
  const { profile, updateProfile } = useAuth();
  const [form, setForm] = useState(initialState);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setForm({
      age: profile.age || "",
      occupation: profile.occupation || "",
      category: profile.category || "",
      annual_income: profile.annual_income || "",
      gender: profile.gender || "",
      city: profile.location?.city || "",
      state: profile.location?.state || "",
      phone: profile.phone || "",
    });
  }, [profile]);

  const onChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const validate = () => {
    if (!form.age || Number(form.age) <= 0) {
      toast.error("Valid age is required.");
      return false;
    }
    if (!form.occupation.trim()) {
      toast.error("Occupation is required.");
      return false;
    }
    if (!form.category.trim()) {
      toast.error("Category is required.");
      return false;
    }
    if (!form.state.trim()) {
      toast.error("State is required.");
      return false;
    }
    if (!form.phone.trim()) {
      toast.error("Phone is required.");
      return false;
    }
    return true;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!validate()) return;

    const payload = {
      age: Number(form.age),
      occupation: form.occupation.trim(),
      category: form.category.trim(),
      annual_income: form.annual_income ? Number(form.annual_income) : null,
      gender: form.gender.trim(),
      location: {
        city: form.city.trim(),
        state: form.state.trim(),
        country: "India",
      },
      phone: form.phone.trim(),
    };

    try {
      setSaving(true);
      const response = await profileApi.createProfile(payload);
      const profileData = response?.profile || payload;
      updateProfile(profileData);
      if (response?.profile_updated) {
        toast.success("Profile updated successfully");
      } else {
        toast.success("Profile saved successfully");
      }
      onSaved?.(profileData);
    } catch (error) {
      toast.error(error.message || "Failed to save profile");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="grid gap-3 sm:grid-cols-2" onSubmit={handleSubmit}>
      <label className="block">
        <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Age</span>
        <input
          type="number"
          min="1"
          name="age"
          value={form.age}
          onChange={onChange}
          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2"
          placeholder="22"
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
          Occupation
        </span>
        <input
          type="text"
          name="occupation"
          value={form.occupation}
          onChange={onChange}
          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2"
          placeholder="Student"
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Category</span>
        <input
          type="text"
          name="category"
          value={form.category}
          onChange={onChange}
          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2"
          placeholder="OBC / SC / ST / General"
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
          Annual Income
        </span>
        <input
          type="number"
          min="0"
          name="annual_income"
          value={form.annual_income}
          onChange={onChange}
          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2"
          placeholder="300000"
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Gender</span>
        <input
          type="text"
          name="gender"
          value={form.gender}
          onChange={onChange}
          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2"
          placeholder="Male / Female / Other"
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Phone</span>
        <input
          type="tel"
          name="phone"
          value={form.phone}
          onChange={onChange}
          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2"
          placeholder="9876543210"
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">City</span>
        <input
          type="text"
          name="city"
          value={form.city}
          onChange={onChange}
          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2"
          placeholder="Mumbai"
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">State</span>
        <input
          type="text"
          name="state"
          value={form.state}
          onChange={onChange}
          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2"
          placeholder="Maharashtra"
        />
      </label>

      <div className="sm:col-span-2">
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {saving ? (
            <Spinner label="Saving..." size="sm" />
          ) : (
            <>
              <Save className="h-4 w-4" />
              Save Profile
            </>
          )}
        </button>
      </div>
    </form>
  );
};

export default ProfileForm;
