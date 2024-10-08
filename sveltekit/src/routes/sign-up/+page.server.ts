import { fail } from '@sveltejs/kit';
import { ClientResponseError } from 'pocketbase';

import { registerFormSchema } from '$lib/features/auth';
import { adminPB } from '$lib/shared/api/config.js';

export const prerender = false;

export const actions = {
	default: async ({ request, cookies, locals }) => {
		const rawFormData = Object.fromEntries(await request.formData());
		const formData = registerFormSchema.safeParse(rawFormData);

		// Validate the form data
		if (!formData.success) {
			const formattedErrors = formData.error.format();
			let errorMessages: string[] = [];

			(['username', 'email', 'password'] as const).forEach((field) => {
				const fieldErrors = formattedErrors[field];
				if (fieldErrors && fieldErrors._errors) {
					errorMessages = errorMessages.concat(fieldErrors._errors);
				}
			});

			const errorString = errorMessages.join(', ');

			return fail(400, { error: { message: errorString } });
		}

		const { username, email, password } = formData.data;
		const pb = locals.pb;

		// Check if username is already in use
		try {
			const existingUserByUsername = await adminPB
				.collection('user')
				.getFirstListItem(`username="${username}"`);
			if (existingUserByUsername)
				return fail(400, { error: { message: 'User with this username already exists.' } });
		} catch (err) {
			if (err instanceof ClientResponseError) {
				if (err.status === 404) console.log('USERNAME IS NOT FOUND. MAY BE UNIQUE');
				else
					return fail(500, {
						error: { message: 'Internal server error. Please try again later.' }
					});
			} else
				return fail(500, { error: { message: 'Internal server error. Please try again later.' } });
		}

		// Check if email is already in use
		try {
			const existingUserByEmail = await adminPB
				.collection('user')
				.getFirstListItem(`email="${email}"`);
			if (existingUserByEmail)
				return fail(400, { error: { message: 'User with this email already exists.' } });
		} catch (err) {
			if (err instanceof ClientResponseError) {
				if (err.status === 404) console.log('EMAIL IS NOT FOUND. MAY BE UNIQUE');
				else
					return fail(500, {
						error: { message: 'Internal server error. Please try again later.' }
					});
			} else
				return fail(500, { error: { message: 'Internal server error. Please try again later.' } });
		}

		// Creating new user
		const createDto = {
			username,
			email,
			emailVisibility: true,
			password,
			passwordConfirm: password,
			name: username
		};

		try {
			await adminPB.collection('user').create(createDto);
			await adminPB.collection('user').requestVerification(email);

			await pb.collection('user').authWithPassword(email, password);
		} catch {
			return fail(500, { error: { message: 'Failed to create user. Please try again later.' } });
		}
		cookies.set('token', pb.authStore.token, { path: '/' });

		return pb.authStore.model;
	}
};
