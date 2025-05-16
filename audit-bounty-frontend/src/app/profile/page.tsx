'use client';

import { useState, useEffect } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';

interface UserProfile {
  name: string;
  email: string;
  bio: string;
  website: string;
  github: string;
  twitter: string;
  profilePicture: string;
  role: 'creator' | 'contributor';
  walletAddress: string | null;
  skills: string[];
}

export default function ProfilePage() {
  const { user, loading: authLoading, linkedWallet } = useAuth();
  const router = useRouter();
  
  const [profile, setProfile] = useState<UserProfile>({
    name: '',
    email: '',
    bio: '',
    website: '',
    github: '',
    twitter: '',
    profilePicture: '',
    role: 'contributor',
    walletAddress: null,
    skills: []
  });
  
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [newSkill, setNewSkill] = useState('');

  // Redirect if not logged in
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login?redirect=/profile');
      return;
    }

    // Fetch user profile data
    const fetchUserProfile = async () => {
      if (!user) return;
      
      try {
        setLoading(true);
        const userDocRef = doc(db, 'users', user.uid);
        const userDoc = await getDoc(userDocRef);
        
        if (userDoc.exists()) {
          const userData = userDoc.data();
          setProfile({
            name: userData.name || user.displayName || '',
            email: userData.email || user.email || '',
            bio: userData.bio || '',
            website: userData.website || '',
            github: userData.github || '',
            twitter: userData.twitter || '',
            profilePicture: userData.profilePicture || user.photoURL || '',
            role: userData.role || 'contributor',
            walletAddress: userData.walletAddress || null,
            skills: userData.skills || []
          });
        } else {
          // Use default values from auth if profile doesn't exist
          setProfile({
            ...profile,
            name: user.displayName || '',
            email: user.email || '',
            profilePicture: user.photoURL || ''
          });
        }
      } catch (err) {
        console.error('Error fetching profile:', err);
        setError('Failed to load profile data');
      } finally {
        setLoading(false);
      }
    };

    fetchUserProfile();
  }, [user, authLoading, router]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setProfile({
      ...profile,
      [name]: value
    });
  };

  const addSkill = () => {
    if (newSkill.trim() === '') return;
    if (profile.skills.includes(newSkill.trim())) return;
    
    setProfile({
      ...profile,
      skills: [...profile.skills, newSkill.trim()]
    });
    setNewSkill('');
  };

  const removeSkill = (skill: string) => {
    setProfile({
      ...profile,
      skills: profile.skills.filter(s => s !== skill)
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    try {
      setSaving(true);
      setError(null);
      
      const userDocRef = doc(db, 'users', user.uid);
      await updateDoc(userDocRef, {
        name: profile.name,
        bio: profile.bio,
        website: profile.website,
        github: profile.github,
        twitter: profile.twitter,
        role: profile.role,
        skills: profile.skills
      });
      
      setSuccess(true);
      setIsEditing(false);
      
      // Clear success message after a delay
      setTimeout(() => {
        setSuccess(false);
      }, 3000);
    } catch (err) {
      console.error('Error updating profile:', err);
      setError('Failed to update profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (authLoading || loading) {
    return (
      <MainLayout>
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded w-1/4 mb-4"></div>
            <div className="h-4 bg-gray-200 rounded w-full mb-6"></div>
            <div className="h-64 bg-gray-200 rounded w-full mb-4"></div>
          </div>
        </div>
      </MainLayout>
    );
  }

  if (!user) {
    return (
      <MainLayout>
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-gray-900">Authentication Required</h2>
            <p className="mt-2 text-gray-600">You need to be logged in to view your profile.</p>
            <div className="mt-6">
              <Link 
                href="/login?redirect=/profile"
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                Go to Login
              </Link>
            </div>
          </div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="md:flex md:items-center md:justify-between mb-6">
          <div className="flex-1 min-w-0">
            <h2 className="text-2xl font-bold leading-7 text-gray-900 sm:text-3xl sm:truncate">
              {isEditing ? 'Edit Profile' : 'Your Profile'}
            </h2>
          </div>
          <div className="mt-4 flex md:mt-0 md:ml-4">
            {!isEditing && (
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                Edit Profile
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-md bg-red-50 p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">{error}</h3>
              </div>
            </div>
          </div>
        )}
        
        {success && (
          <div className="mb-4 rounded-md bg-green-50 p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-green-800">Profile updated successfully!</h3>
              </div>
            </div>
          </div>
        )}

        <div className="bg-white shadow overflow-hidden sm:rounded-lg">
          {isEditing ? (
            <form onSubmit={handleSubmit}>
              <div className="px-4 py-5 sm:p-6">
                <div className="grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-6">
                  <div className="sm:col-span-3">
                    <label htmlFor="name" className="block text-sm font-medium text-gray-700">
                      Name
                    </label>
                    <div className="mt-1">
                      <input
                        type="text"
                        name="name"
                        id="name"
                        value={profile.name}
                        onChange={handleInputChange}
                        className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
                      />
                    </div>
                  </div>

                  <div className="sm:col-span-3">
                    <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                      Email
                    </label>
                    <div className="mt-1">
                      <input
                        type="email"
                        name="email"
                        id="email"
                        value={profile.email}
                        disabled
                        className="shadow-sm bg-gray-50 block w-full sm:text-sm border-gray-300 rounded-md"
                      />
                    </div>
                    <p className="mt-1 text-xs text-gray-500">Email cannot be changed</p>
                  </div>

                  <div className="sm:col-span-6">
                    <label htmlFor="bio" className="block text-sm font-medium text-gray-700">
                      Bio
                    </label>
                    <div className="mt-1">
                      <textarea
                        id="bio"
                        name="bio"
                        rows={3}
                        value={profile.bio}
                        onChange={handleInputChange}
                        className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
                        placeholder="Tell us about yourself and your experience"
                      />
                    </div>
                  </div>

                  <div className="sm:col-span-3">
                    <label htmlFor="website" className="block text-sm font-medium text-gray-700">
                      Website
                    </label>
                    <div className="mt-1">
                      <input
                        type="text"
                        name="website"
                        id="website"
                        value={profile.website}
                        onChange={handleInputChange}
                        className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
                        placeholder="https://example.com"
                      />
                    </div>
                  </div>

                  <div className="sm:col-span-3">
                    <label htmlFor="role" className="block text-sm font-medium text-gray-700">
                      Role
                    </label>
                    <div className="mt-1">
                      <select
                        id="role"
                        name="role"
                        value={profile.role}
                        onChange={handleInputChange}
                        className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
                      >
                        <option value="contributor">Security Auditor</option>
                        <option value="creator">Project Owner</option>
                      </select>
                    </div>
                  </div>

                  <div className="sm:col-span-3">
                    <label htmlFor="github" className="block text-sm font-medium text-gray-700">
                      GitHub Username
                    </label>
                    <div className="mt-1">
                      <input
                        type="text"
                        name="github"
                        id="github"
                        value={profile.github}
                        onChange={handleInputChange}
                        className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
                        placeholder="your-github-username"
                      />
                    </div>
                  </div>

                  <div className="sm:col-span-3">
                    <label htmlFor="twitter" className="block text-sm font-medium text-gray-700">
                      Twitter Username
                    </label>
                    <div className="mt-1">
                      <input
                        type="text"
                        name="twitter"
                        id="twitter"
                        value={profile.twitter}
                        onChange={handleInputChange}
                        className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
                        placeholder="your-twitter-username"
                      />
                    </div>
                  </div>

                  <div className="sm:col-span-6">
                    <label htmlFor="walletAddress" className="block text-sm font-medium text-gray-700">
                      Wallet Address
                    </label>
                    <div className="mt-1">
                      <input
                        type="text"
                        name="walletAddress"
                        id="walletAddress"
                        value={linkedWallet || ''}
                        disabled
                        className="shadow-sm bg-gray-50 block w-full sm:text-sm border-gray-300 rounded-md"
                      />
                    </div>
                    <div className="mt-1">
                      <Link
                        href="/connect-wallet"
                        className="text-sm font-medium text-indigo-600 hover:text-indigo-500"
                      >
                        {linkedWallet ? 'Change Wallet' : 'Connect Wallet'}
                      </Link>
                    </div>
                  </div>

                  <div className="sm:col-span-6">
                    <label htmlFor="skills" className="block text-sm font-medium text-gray-700">
                      Skills & Expertise
                    </label>
                    <div className="mt-1">
                      <div className="flex">
                        <input
                          type="text"
                          id="newSkill"
                          value={newSkill}
                          onChange={(e) => setNewSkill(e.target.value)}
                          className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
                          placeholder="Add a skill (e.g. Smart Contract Auditing, Solana, ZK proofs)"
                        />
                        <button
                          type="button"
                          onClick={addSkill}
                          className="ml-3 inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                        >
                          Add
                        </button>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {profile.skills.map((skill) => (
                        <span 
                          key={skill} 
                          className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800"
                        >
                          {skill}
                          <button
                            type="button"
                            onClick={() => removeSkill(skill)}
                            className="ml-1.5 inline-flex items-center justify-center h-4 w-4 rounded-full text-indigo-400 hover:bg-indigo-200 hover:text-indigo-600 focus:outline-none"
                          >
                            <span className="sr-only">Remove {skill}</span>
                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              <div className="px-4 py-3 bg-gray-50 text-right sm:px-6">
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="bg-white py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="ml-3 inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </form>
          ) : (
            <div>
              <div className="px-4 py-5 sm:px-6">
                <div className="flex items-center">
                  {profile.profilePicture && (
                    <img
                      className="h-16 w-16 rounded-full mr-4"
                      src={profile.profilePicture}
                      alt={profile.name}
                    />
                  )}
                  <div>
                    <h3 className="text-lg leading-6 font-medium text-gray-900">
                      {profile.name}
                    </h3>
                    <p className="mt-1 max-w-2xl text-sm text-gray-500">
                      {profile.role === 'creator' ? 'Project Owner' : 'Security Auditor'}
                    </p>
                  </div>
                </div>
              </div>
              <div className="border-t border-gray-200 px-4 py-5 sm:p-0">
                <dl className="sm:divide-y sm:divide-gray-200">
                  <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                    <dt className="text-sm font-medium text-gray-500">Email</dt>
                    <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">{profile.email}</dd>
                  </div>
                  <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                    <dt className="text-sm font-medium text-gray-500">Bio</dt>
                    <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                      {profile.bio || <span className="text-gray-500 italic">No bio provided</span>}
                    </dd>
                  </div>
                  {profile.website && (
                    <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                      <dt className="text-sm font-medium text-gray-500">Website</dt>
                      <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                        <a href={profile.website} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:text-indigo-500">
                          {profile.website}
                        </a>
                      </dd>
                    </div>
                  )}
                  {profile.github && (
                    <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                      <dt className="text-sm font-medium text-gray-500">GitHub</dt>
                      <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                        <a href={`https://github.com/${profile.github}`} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:text-indigo-500">
                          @{profile.github}
                        </a>
                      </dd>
                    </div>
                  )}
                  {profile.twitter && (
                    <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                      <dt className="text-sm font-medium text-gray-500">Twitter</dt>
                      <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                        <a href={`https://twitter.com/${profile.twitter}`} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:text-indigo-500">
                          @{profile.twitter}
                        </a>
                      </dd>
                    </div>
                  )}
                  <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                    <dt className="text-sm font-medium text-gray-500">Wallet Address</dt>
                    <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                      {linkedWallet ? (
                        <div>
                          <span className="font-mono break-all">{linkedWallet}</span>
                          <div className="mt-1">
                            <Link 
                              href="/connect-wallet" 
                              className="text-sm font-medium text-indigo-600 hover:text-indigo-500"
                            >
                              Change Wallet
                            </Link>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <span className="text-gray-500 italic">No wallet connected</span>
                          <div className="mt-1">
                            <Link 
                              href="/connect-wallet" 
                              className="text-sm font-medium text-indigo-600 hover:text-indigo-500"
                            >
                              Connect Wallet
                            </Link>
                          </div>
                        </div>
                      )}
                    </dd>
                  </div>
                  <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                    <dt className="text-sm font-medium text-gray-500">Skills & Expertise</dt>
                    <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                      <div className="flex flex-wrap gap-2">
                        {profile.skills.length > 0 ? (
                          profile.skills.map((skill) => (
                            <span 
                              key={skill} 
                              className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800"
                            >
                              {skill}
                            </span>
                          ))
                        ) : (
                          <span className="text-gray-500 italic">No skills listed</span>
                        )}
                      </div>
                    </dd>
                  </div>
                </dl>
              </div>
            </div>
          )}
        </div>
        
        <div className="mt-6">
          <Link 
            href="/dashboard" 
            className="text-sm font-medium text-indigo-600 hover:text-indigo-500"
          >
            &larr; Back to Dashboard
          </Link>
        </div>
      </div>
    </MainLayout>
  );
} 